import { createClient } from "@supabase/supabase-js";

type EventRow={
  id:string; tenant_id:string; event_type:string; entity_type:string|null; entity_id:string|null;
  payload:Record<string,unknown>; mode:"live"|"test"; target_rule_id:string|null; attempts:number;
};
type Rule={id:string;tenant_id:string;name:string;status:string;trigger_event:string|null};
type Node={id:string;node_type:string;action_type:string|null;label:string;config:Record<string,unknown>;is_enabled:boolean};
type Edge={id:string;source_node_id:string;target_node_id:string;source_handle:string;label:string|null};

const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json; charset=utf-8"}});

function getPath(source:unknown,path:string):unknown{
  if(!path)return undefined;
  return path.split(".").reduce((value:unknown,key:string)=>{
    if(value&&typeof value==="object"&&key in (value as Record<string,unknown>))return (value as Record<string,unknown>)[key];
    return undefined;
  },source);
}
function compare(actual:unknown,operator:string,expected:unknown){
  if(operator==="exists")return actual!==undefined&&actual!==null&&actual!=="";
  if(operator==="equals")return String(actual??"")===String(expected??"");
  if(operator==="not_equals")return String(actual??"")!==String(expected??"");
  if(operator==="contains")return String(actual??"").toLowerCase().includes(String(expected??"").toLowerCase());
  const a=Number(actual),b=Number(expected);
  if(!Number.isFinite(a)||!Number.isFinite(b))return false;
  if(operator==="gt")return a>b;
  if(operator==="gte")return a>=b;
  if(operator==="lt")return a<b;
  return false;
}
function render(template:string,context:Record<string,unknown>){
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g,(_m,path)=>String(getPath(context,path)??""));
}
function configText(config:Record<string,unknown>,...keys:string[]){
  for(const key of keys){const value=config[key];if(typeof value==="string"&&value.trim())return value.trim()}
  return "";
}

Deno.serve(async(req)=>{
  if(req.method!=="POST")return json({ok:false,error:"method_not_allowed"},405);
  const key=req.headers.get("x-automation-worker-key")??"";
  if(!key)return json({ok:false,error:"worker_key_required"},401);

  const url=Deno.env.get("SUPABASE_URL")!;
  const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const db=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});

  const authorized=await db.rpc("automation_worker_authorized",{p_key:key});
  if(authorized.error||authorized.data!==true)return json({ok:false,error:"worker_not_authorized"},403);

  const body=await req.json().catch(()=>({}));
  const limit=Math.max(1,Math.min(Number(body?.limit??20)||20,50));
  const claimed=await db.rpc("claim_automation_events",{p_limit:limit});
  if(claimed.error)return json({ok:false,error:"claim_failed",detail:claimed.error.message},500);

  const events=(claimed.data??[]) as EventRow[];
  const summary:{event_id:string;status:string;rules:number;error?:string}[]=[];

  for(const event of events){
    try{
      let ruleQuery=db.from("automation_rules")
        .select("id,tenant_id,name,status,trigger_event")
        .eq("tenant_id",event.tenant_id)
        .eq("trigger_type","event")
        .eq("trigger_event",event.event_type);

      if(event.mode==="test"&&event.target_rule_id){
        ruleQuery=ruleQuery.eq("id",event.target_rule_id).in("status",["testing","active"]);
      }else{
        ruleQuery=ruleQuery.eq("status","active");
      }
      const rulesResult=await ruleQuery;
      if(rulesResult.error)throw new Error(rulesResult.error.message);
      const rules=(rulesResult.data??[]) as Rule[];

      if(!rules.length){
        await db.rpc("finish_automation_event",{p_event_id:event.id,p_status:"skipped",p_error:null});
        summary.push({event_id:event.id,status:"skipped",rules:0});
        continue;
      }

      let processed=0;
      for(const rule of rules){
        const versionResult=await db.from("automation_flow_versions")
          .select("version_number,snapshot")
          .eq("tenant_id",event.tenant_id).eq("rule_id",rule.id).eq("state","published")
          .order("version_number",{ascending:false}).limit(1).maybeSingle();
        if(versionResult.error)throw new Error(versionResult.error.message);
        if(!versionResult.data)continue;

        const version=Number(versionResult.data.version_number);
        const snapshot=(versionResult.data.snapshot??{}) as Record<string,unknown>;
        const nodes=((snapshot.nodes??[]) as Node[]).filter(n=>n.is_enabled!==false);
        const edges=(snapshot.edges??[]) as Edge[];
        const trigger=nodes.find(n=>n.node_type==="trigger");
        if(!trigger)continue;

        const idempotency=`${event.id}:${rule.id}:v${version}`;
        const runInsert=await db.from("automation_runs").insert({
          tenant_id:event.tenant_id,rule_id:rule.id,trigger_event:event.event_type,
          entity_type:event.entity_type,entity_id:event.entity_id,status:"running",
          idempotency_key:idempotency,
          context:{event_id:event.id,event:event.payload,mode:event.mode,flow_version:version},
          started_at:new Date().toISOString()
        }).select("id").single();

        if(runInsert.error){
          if(runInsert.error.code==="23505"){processed++;continue}
          throw new Error(runInsert.error.message);
        }

        const runId=runInsert.data.id as string;
        const context:Record<string,unknown>={...event.payload,event:event.payload,event_type:event.event_type,entity_type:event.entity_type,entity_id:event.entity_id};
        const nodeMap=new Map(nodes.map(n=>[n.id,n]));
        const queue:string[]=[trigger.id];
        const visited=new Set<string>();
        let runFailed:string|null=null;

        while(queue.length&&!runFailed){
          const nodeId=queue.shift()!;
          if(visited.has(nodeId))continue;
          visited.add(nodeId);
          const node=nodeMap.get(nodeId);
          if(!node)continue;
          const started=Date.now();
          const nodeRun=await db.from("automation_flow_node_runs").insert({
            tenant_id:event.tenant_id,run_id:runId,node_id:node.id,status:"running",
            input:{context,node_config:node.config},started_at:new Date(started).toISOString()
          }).select("id").single();
          if(nodeRun.error){runFailed=nodeRun.error.message;break}

          let branch="default";
          let output:Record<string,unknown>={};
          let nodeError:string|null=null;

          try{
            const cfg=node.config??{};
            if(node.node_type==="trigger"){
              output={event:event.event_type};
            }else if(node.node_type==="condition"){
              const actual=getPath(context,String(cfg.field??""));
              const result=compare(actual,String(cfg.operator??"equals"),cfg.compare);
              branch=result?"yes":"no";
              output={actual,result,branch};
            }else if(node.node_type==="delay"){
              if(event.mode==="test"){
                output={test_mode:true,delay_skipped:true,minutes:Number(cfg.minutes??0)};
              }else{
                throw new Error("delay_executor_not_enabled");
              }
            }else if(node.node_type==="approval"){
              throw new Error("approval_executor_not_enabled");
            }else if(node.node_type==="ai"){
              throw new Error("ai_executor_not_connected");
            }else{
              const type=node.action_type??"";
              if(type==="create_task"){
                const title=render(configText(cfg,"message","value")||node.label,context).slice(0,240);
                const dueMinutes=Math.max(0,Number(cfg.due_minutes??0)||0);
                const task=await db.from("tasks").insert({
                  tenant_id:event.tenant_id,title,status:"todo",priority:String(cfg.priority??"normal"),
                  due_at:dueMinutes?new Date(Date.now()+dueMinutes*60000).toISOString():null,
                  assigned_user_id:typeof cfg.user_id==="string"?cfg.user_id:(context.owner_user_id as string|null??null),
                  contact_id:context.contact_id as string|null??null,company_id:context.company_id as string|null??null,
                  opportunity_id:context.opportunity_id as string|null??null,source:"automation",
                  metadata:{automation_run_id:runId,automation_rule_id:rule.id,event_id:event.id}
                }).select("id").single();
                if(task.error)throw new Error(task.error.message);
                output={task_id:task.data.id};
              }else if(type==="assign_owner"){
                const userId=configText(cfg,"user_id","value");
                if(!userId)throw new Error("assign_owner_user_required");
                if(context.opportunity_id){
                  const u=await db.from("opportunities").update({owner_user_id:userId}).eq("tenant_id",event.tenant_id).eq("id",String(context.opportunity_id));
                  if(u.error)throw new Error(u.error.message);
                }else if(context.contact_id){
                  const u=await db.from("contacts").update({owner_user_id:userId}).eq("tenant_id",event.tenant_id).eq("id",String(context.contact_id));
                  if(u.error)throw new Error(u.error.message);
                }else throw new Error("assign_owner_entity_missing");
                context.owner_user_id=userId; output={owner_user_id:userId};
              }else if(type==="update_contact"){
                const field=String(cfg.field??"");
                const allowed=new Set(["status","job_title","phone","whatsapp_phone"]);
                if(!allowed.has(field)||!context.contact_id)throw new Error("update_contact_config_invalid");
                const value=cfg.value??null;
                const u=await db.from("contacts").update({[field]:value}).eq("tenant_id",event.tenant_id).eq("id",String(context.contact_id));
                if(u.error)throw new Error(u.error.message);
                context[field]=value; output={field,value};
              }else if(type==="update_opportunity"){
                const field=String(cfg.field??"");
                const allowed=new Set(["lead_score","next_action","next_action_at"]);
                if(!allowed.has(field)||!context.opportunity_id)throw new Error("update_opportunity_config_invalid");
                const value=cfg.value??null;
                const u=await db.from("opportunities").update({[field]:value}).eq("tenant_id",event.tenant_id).eq("id",String(context.opportunity_id));
                if(u.error)throw new Error(u.error.message);
                context[field]=value; output={field,value};
              }else if(type==="move_stage"){
                const stageId=configText(cfg,"stage_id","value");
                if(!stageId||!context.opportunity_id)throw new Error("move_stage_config_invalid");
                const stage=await db.from("pipeline_stages").select("id,win_probability,stage_type").eq("tenant_id",event.tenant_id).eq("id",stageId).maybeSingle();
                if(stage.error||!stage.data)throw new Error("stage_not_found");
                const status=stage.data.stage_type==="won"?"won":stage.data.stage_type==="lost"?"lost":"open";
                const u=await db.from("opportunities").update({stage_id:stageId,probability:stage.data.win_probability,status}).eq("tenant_id",event.tenant_id).eq("id",String(context.opportunity_id));
                if(u.error)throw new Error(u.error.message);
                context.stage_id=stageId;context.status=status;output={stage_id:stageId,status};
              }else if(type==="create_notification"){
                const title=render(configText(cfg,"message","value")||node.label,context).slice(0,240);
                const a=await db.from("activities").insert({
                  tenant_id:event.tenant_id,contact_id:context.contact_id as string|null??null,
                  opportunity_id:context.opportunity_id as string|null??null,type:"other",
                  title,description:"Creada por Automation Studio"
                }).select("id").single();
                if(a.error)throw new Error(a.error.message);
                output={activity_id:a.data.id};
              }else if(type==="send_whatsapp"||type==="send_email"){
                const provider=type==="send_whatsapp"?"whatsapp":"email";
                const channel=await db.from("channels").select("id,status").eq("tenant_id",event.tenant_id).eq("provider",provider).eq("status","connected").limit(1).maybeSingle();
                if(channel.error||!channel.data)throw new Error(`${provider}_channel_not_connected`);
                throw new Error(`${provider}_delivery_executor_not_enabled`);
              }else if(type==="sync_odoo"){
                const erp=await db.from("erp_connections").select("id,status").eq("tenant_id",event.tenant_id).eq("provider","odoo").eq("status","connected").limit(1).maybeSingle();
                if(erp.error||!erp.data)throw new Error("odoo_not_connected");
                throw new Error("odoo_automation_executor_not_enabled");
              }else if(["call_webhook","invoke_ai","create_quotation","create_order","generate_document"].includes(type)){
                throw new Error(`${type}_executor_not_enabled`);
              }else{
                throw new Error("unsupported_action_type");
              }
            }
          }catch(error){
            nodeError=error instanceof Error?error.message:"node_failed";
          }

          const duration=Date.now()-started;
          await db.from("automation_flow_node_runs").update({
            status:nodeError?"failed":"succeeded",output:nodeError?null:output,error_message:nodeError,
            finished_at:new Date().toISOString(),duration_ms:duration
          }).eq("tenant_id",event.tenant_id).eq("id",nodeRun.data.id);

          if(nodeError){runFailed=`${node.label}: ${nodeError}`;break}

          const outgoing=edges.filter(e=>e.source_node_id===node.id&&(node.node_type!=="condition"||e.source_handle===branch||e.source_handle==="default"));
          for(const edge of outgoing)if(!visited.has(edge.target_node_id))queue.push(edge.target_node_id);
        }

        await db.from("automation_runs").update({
          status:runFailed?"failed":"succeeded",
          result:runFailed?null:{visited_nodes:[...visited],flow_version:version},
          error_message:runFailed,
          finished_at:new Date().toISOString()
        }).eq("tenant_id",event.tenant_id).eq("id",runId);

        processed++;
      }

      await db.rpc("finish_automation_event",{p_event_id:event.id,p_status:processed?"succeeded":"skipped",p_error:null});
      summary.push({event_id:event.id,status:processed?"succeeded":"skipped",rules:processed});
    }catch(error){
      const message=error instanceof Error?error.message:"event_failed";
      const retry=event.attempts<3;
      await db.rpc("finish_automation_event",{p_event_id:event.id,p_status:retry?"queued":"failed",p_error:message});
      summary.push({event_id:event.id,status:retry?"queued":"failed",rules:0,error:message});
    }
  }

  return json({ok:true,claimed:events.length,events:summary});
});