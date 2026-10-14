import assert from 'node:assert/strict';
import { test } from 'node:test';
import { processAutomationEvents, compare, nextNodes, MAX_FLOW_STEPS } from '../supabase/functions/automation-engine/worker.ts';

// Exercise the real worker with a deterministic persistence adapter. SQL tests
// independently exercise atomic effects/tenant checks on the real database.
function fixture(nodes, edges, options = {}) {
  const event = { id:'event-a',tenant_id:'tenant-a',event_type:'lead_created',entity_type:'contact',entity_id:'contact-a',payload:{contact_id:'contact-a',lead_score:75},mode:'live',target_rule_id:'rule-a',attempts:1,...options.event };
  const tables = {
    tenants:[{id:'tenant-a',status:options.tenantStatus || 'active'}],
    automation_rules:[{id:'rule-a',tenant_id:'tenant-a',name:'QA Flow',trigger_type:'event',trigger_event:'lead_created',status:event.mode==='test'?'testing':'active'}],
    automation_flow_versions:[{tenant_id:'tenant-a',rule_id:'rule-a',version_number:1,state:'published',snapshot:{nodes,edges}}],
    automation_runs:[],automation_flow_node_runs:[],channels:[],erp_connections:[]
  };
  let sequence = 0, failOnce = options.failOnce;
  const effects = new Map(), mutations = [], finishes = [], rpcCalls = [];
  const db = {
    from(table) {
      const filters = []; let operation='select', values, single=false;
      const builder = {
        select() { return this; },
        eq(key,value) { filters.push(row=>row[key]===value); return this; },
        in(key,values) { filters.push(row=>values.includes(row[key])); return this; },
        order() { return this; }, limit() { return this; },
        maybeSingle() { single=true; return this; }, single() { single=true; return this; },
        insert(value) { operation='insert'; values=value; return this; },
        update(value) { operation='update'; values=value; return this; },
        then(resolve,reject) {
          try {
            let rows=tables[table].filter(row=>filters.every(filter=>filter(row)));
            if (operation==='insert') {
              const row={id:`row-${++sequence}`,...structuredClone(values)};
              tables[table].push(row); rows=[row]; mutations.push({table,operation,values:structuredClone(values)});
            }
            if (operation==='update') { rows.forEach(row=>Object.assign(row,structuredClone(values))); mutations.push({table,operation,values:structuredClone(values)}); }
            return Promise.resolve({data:single?rows[0]??null:rows,error:null}).then(resolve,reject);
          } catch(error) { return Promise.reject(error).then(resolve,reject); }
        }
      }; return builder;
    },
    async rpc(name,args) {
      rpcCalls.push({name,args:structuredClone(args)});
      if (name==='finish_automation_event') { finishes.push(args); return {data:null,error:null}; }
      if (name==='execute_automation_internal_action') {
        const key=`${args.p_run_id}:${args.p_node_id}`;
        if (effects.has(key)) return {data:{...effects.get(key),replayed:true},error:null};
        if (failOnce===args.p_node_id) { failOnce=null; return {data:null,error:{message:'temporary_database_failure',code:options.transientError?'40001':undefined}}; }
        const output={task_id:`task-${effects.size+1}`}; effects.set(key,output); return {data:output,error:null};
      }
      throw new Error(`Unexpected RPC ${name}`);
    }
  };
  return {event,tables,effects,mutations,finishes,rpcCalls,db};
}
const trigger={id:'trigger',node_type:'trigger',label:'Lead',config:{},is_enabled:true};
const action=(id,type='create_task',config={})=>({id,node_type:'action',action_type:type,label:id,config,is_enabled:true});
const edge=(source,target,handle='default')=>({source_node_id:source,target_node_id:target,source_handle:handle});

test('test mode logs six internal actions without any business action RPC',async()=>{
  const actions=[action('task'),action('activity','create_notification'),action('owner','assign_owner',{user_id:'user-a'}),action('contact','update_contact',{field:'status',value:'qualified'}),action('opportunity','update_opportunity',{field:'lead_score',value:90}),action('stage','move_stage',{stage_id:'stage-a'})];
  const nodes=[trigger,...actions], edges=nodes.slice(1).map((node,index)=>edge(nodes[index].id,node.id));
  const f=fixture(nodes,edges,{event:{mode:'test'}});
  assert.equal((await processAutomationEvents(f.db,[f.event]))[0].status,'succeeded');
  assert.equal(f.effects.size,0);
  assert.equal(f.rpcCalls.filter(call=>call.name==='execute_automation_internal_action').length,0);
  assert.ok(f.mutations.every(m=>['automation_runs','automation_flow_node_runs'].includes(m.table)));
  assert.ok(f.tables.automation_flow_node_runs.slice(1).every(row=>row.output.simulated===true));
});

test('a failed provider node fails both the flow and event with its reason',async()=>{
  const f=fixture([trigger,action('whatsapp','send_whatsapp')],[edge('trigger','whatsapp')]);
  const result=await processAutomationEvents(f.db,[f.event]);
  assert.equal(result[0].status,'failed'); assert.match(result[0].error,/whatsapp_channel_not_connected/);
  assert.equal(f.tables.automation_runs[0].status,'failed');
  assert.equal(f.finishes[0].p_status,'failed'); assert.equal(f.effects.size,0);
});

test('retry uses the same version/run and does not duplicate completed effects',async()=>{
  const f=fixture([trigger,action('task-one'),action('task-two')],[edge('trigger','task-one'),edge('task-one','task-two')],{failOnce:'task-two'});
  assert.equal((await processAutomationEvents(f.db,[f.event]))[0].status,'failed');
  assert.equal(f.effects.size,1);
  f.tables.automation_flow_versions[0].state='archived';
  f.tables.automation_flow_versions.push({tenant_id:'tenant-a',rule_id:'rule-a',version_number:2,state:'published',snapshot:{nodes:[trigger],edges:[]}});
  f.event.attempts=2;
  assert.equal((await processAutomationEvents(f.db,[f.event]))[0].status,'succeeded');
  assert.equal(f.effects.size,2); assert.equal(f.tables.automation_runs.length,1);
  assert.equal(f.tables.automation_runs[0].context.flow_version,1);
  const calls=f.rpcCalls.length;
  await processAutomationEvents(f.db,[f.event]);
  assert.equal(f.effects.size,2); assert.equal(f.rpcCalls.length,calls+1,'succeeded run is only acknowledged');
});

test('conditions follow the matching branch and use default only as fallback',async()=>{
  const condition={id:'condition',node_type:'condition',label:'Score',config:{field:'lead_score',operator:'gte',compare:70},is_enabled:true};
  const f=fixture([trigger,condition,action('yes'),action('no'),action('fallback')],[edge('trigger','condition'),edge('condition','yes','yes'),edge('condition','no','no'),edge('condition','fallback')]);
  await processAutomationEvents(f.db,[f.event]);
  assert.deepEqual(f.tables.automation_flow_node_runs.map(row=>row.node_id),['trigger','condition','yes']);
  assert.deepEqual(nextNodes(condition,[edge('condition','fallback')],'no'),['fallback']);
  assert.equal(compare(null,'gte',0),false); assert.equal(compare(3,'lte',4),true);
});

test('suspended tenant, excessive depth and oversized flows cannot execute effects',async()=>{
  for (const options of [{tenantStatus:'suspended'},{event:{payload:{_automation:{depth:10}}}}]) {
    const f=fixture([trigger,action('task')],[edge('trigger','task')],options);
    assert.equal((await processAutomationEvents(f.db,[f.event]))[0].status,'failed');
    assert.equal(f.mutations.length,0); assert.equal(f.effects.size,0);
  }
  const f=fixture([trigger,...Array.from({length:MAX_FLOW_STEPS},(_,i)=>action(`task-${i}`))],[]);
  assert.equal((await processAutomationEvents(f.db,[f.event]))[0].status,'failed'); assert.equal(f.effects.size,0);
});

test('database log failure schedules a retry rather than silently succeeding',async()=>{
  const f=fixture([trigger,action('task')],[edge('trigger','task')]);
  const original=f.db.from;
  f.db.from=table=>table==='automation_runs'?{select(){return this;},eq(){return this;},maybeSingle:async()=>({data:null,error:{message:'database_unavailable'}})}:original(table);
  assert.equal((await processAutomationEvents(f.db,[f.event]))[0].status,'queued'); assert.equal(f.effects.size,0);
});

test('SQLSTATE 40001 requeues once and retries without duplicate effects',async()=>{
 const f=fixture([trigger,action('one'),action('two')],[edge('trigger','one'),edge('one','two')],{failOnce:'two',transientError:true});
 assert.equal((await processAutomationEvents(f.db,[f.event]))[0].status,'queued');
 assert.equal(f.effects.size,1);
 f.event.attempts=2;
 assert.equal((await processAutomationEvents(f.db,[f.event]))[0].status,'succeeded');
 assert.equal(f.effects.size,2);
});

test('SQLSTATE 40001 stops retrying at attempt three',async()=>{
 const f=fixture([trigger,action('task')],[edge('trigger','task')],{failOnce:'task',transientError:true,event:{attempts:3}});
 assert.equal((await processAutomationEvents(f.db,[f.event]))[0].status,'failed');
});
