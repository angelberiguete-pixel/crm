"use client";

import Link from "next/link";
import {useEffect,useState} from "react";
import {RefreshCw,ShieldCheck,BrainCircuit} from "lucide-react";
import {supabase} from "@/lib/supabase";
import {useActiveTenant} from "@/components/tenant-context";
import styles from "./family-power-funnel.module.css";
import {COMMERCIAL_SECTORS,SECTOR_KEYS,resolveSector,type CommercialSector} from "@/lib/empresia-sector-presets";

const steps=[
 {key:"visibility",name:"Visibilidad",hint:"Vistas de página registradas",permission:null,href:null},
 {key:"interaction",name:"Interacción",hint:"Clics registrados en el sitio web",permission:null,href:null},
 {key:"conversations",name:"Conversación",hint:"Conversaciones creadas",permission:"inbox",href:"/crm/inbox"},
 {key:"contacts",name:"Prospecto",hint:"Contactos registrados",permission:"contacts",href:"/crm/contacts"},
 {key:"opportunities",name:"Oportunidad",hint:"Oportunidades registradas",permission:"pipeline",href:"/crm/revenue"},
 {key:"quotations",name:"Cotización",hint:"Cotizaciones registradas",permission:"quotations",href:"/crm/quotations"},
 {key:"orders",name:"Venta",hint:"Pedidos confirmados (no equivale a pago)",permission:"operations",href:"/crm/operations"},
 {key:"ecf",name:"Factura e-CF",hint:"Emisión DGII no verificada",permission:null,href:null},
 {key:"deliveries",name:"Entrega",hint:"Entregas con fecha de realización",permission:"operations",href:"/crm/operations"},
 {key:"loyalty",name:"Fidelización",hint:"Satisfacción aún sin medición",permission:null,href:null}
] as const;
type Key=typeof steps[number]["key"];
type Metrics=Record<Key,number|null>;
type Period="30"|"90"|"all";
const empty=()=>Object.fromEntries(steps.map(s=>[s.key,null])) as Metrics;
const number=(n:number|null)=>n===null?"Sin dato":new Intl.NumberFormat("es-DO").format(n);

/** Activity volumes are independent records, NOT a single attributable conversion cohort. */
export default function CommercialFunnel(){
 const tenant=useActiveTenant();
 const tenantId=tenant?.tenant_id??null;
 const canConfigure=Boolean(tenantId&&["owner","admin"].includes(tenant?.membership_role??"")&&tenant?.tenant_slug!=="family-power");
 const [period,setPeriod]=useState<Period>("30");
 const [reload,setReload]=useState(0);
 const [metrics,setMetrics]=useState<Metrics>(empty);
 const [permissions,setPermissions]=useState<Record<string,unknown>>({});
 const [agents,setAgents]=useState<number|null>(null);
 const [draftAgents,setDraftAgents]=useState<number|null>(null);
 const [runs,setRuns]=useState<number|null>(null);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const [sector,setSector]=useState<CommercialSector>("general");
 const [sectorDraft,setSectorDraft]=useState<CommercialSector>("general");
 const [sectorLoading,setSectorLoading]=useState(true);
 const [sectorSaving,setSectorSaving]=useState(false);
 const [sectorNotice,setSectorNotice]=useState("");
 const [snapshot,setSnapshot]=useState<{settings:Record<string,unknown>;updated_at:string}|null>(null);
 const [pipelineStages,setPipelineStages]=useState<string[]>([]);
 useEffect(()=>{
  let live=true;
  setSector("general");setSectorDraft("general");setSectorLoading(true);setSectorNotice("");setPipelineStages([]);setSnapshot(null);
  if(!tenantId){setSectorLoading(false);return()=>{live=false};}
  void (async()=>{
    const [settingRow,installRow,stageRows]=await Promise.all([
      supabase.from("tenant_settings").select("settings,updated_at").eq("tenant_id",tenantId).maybeSingle(),
      supabase.from("tenant_template_installs").select("template_id").eq("tenant_id",tenantId).eq("status","installed").limit(1).maybeSingle(),
      supabase.from("pipeline_stages").select("name,position").eq("tenant_id",tenantId).order("position",{ascending:true}).limit(30)
    ]);
    let templateKey:unknown=null,templateVertical:unknown=null;
    if(installRow.data?.template_id){
      const template=await supabase.from("crm_templates").select("template_key,vertical").eq("id",installRow.data.template_id).maybeSingle();
      templateKey=template.data?.template_key;templateVertical=template.data?.vertical;
    }
    if(!live)return;
    const settingsRaw=settingRow.data?.settings;
    const config=settingsRaw&&typeof settingsRaw==="object"&&!Array.isArray(settingsRaw)?settingsRaw as Record<string,unknown>:{};
    const configured=config.commercial_sector??config.sector;
    const chosen=resolveSector(configured,templateKey,templateVertical);
    setSector(chosen);setSectorDraft(chosen);
    if(settingRow.data?.updated_at)setSnapshot({settings:config,updated_at:settingRow.data.updated_at});
    setPipelineStages([...new Set((stageRows.data??[]).map(s=>String(s.name)).filter(Boolean))].slice(0,12));
    if(settingRow.error||installRow.error||stageRows.error)setSectorNotice("No se pudo comprobar toda la configuración del sector. Se usa el perfil seguro disponible.");
  })().catch(()=>{if(live)setSectorNotice("Configuración sectorial no disponible; se usa el perfil general.");})
     .finally(()=>{if(live)setSectorLoading(false);});
  return()=>{live=false};
 },[tenantId,reload]);
 async function saveSector(){
  if(!canConfigure||!tenantId||sectorSaving)return;
  if(!snapshot){setSectorNotice("No hay configuración guardable para esta empresa.");return;}
  if(sectorDraft===sector){setSectorNotice("El perfil ya está configurado.");return;}
  setSectorSaving(true);setSectorNotice("");
  try{
   // Compare-and-set prevents silently overwriting other settings edited meanwhile.
   const next={...snapshot.settings,commercial_sector:sectorDraft};
   const result=await supabase.from("tenant_settings")
    .update({settings:next}).eq("tenant_id",tenantId).eq("updated_at",snapshot.updated_at)
    .select("settings,updated_at").maybeSingle();
   if(result.error)throw result.error;
   if(!result.data)throw new Error("La configuración cambió en otra sesión. Actualiza antes de guardar.");
   setSnapshot({settings:next,updated_at:result.data.updated_at});
   setSector(sectorDraft);
   setSectorNotice("Perfil comercial guardado para esta empresa. No se modificaron datos ni permisos.");
  }catch(e){setSectorNotice("No se pudo guardar el perfil: "+(e instanceof Error?e.message:"error de conexión"));}
  finally{setSectorSaving(false);}
 }
 const preset=COMMERCIAL_SECTORS[sector];
 useEffect(()=>{
  let alive=true;
  setMetrics(empty());setPermissions({});setAgents(null);setDraftAgents(null);setRuns(null);setError("");setLoading(true);
  if(!tenantId){setLoading(false);return()=>{alive=false;};}
  const since=period==="all"?null:new Date(Date.now()-Number(period)*86400000).toISOString();
  async function count(table:string,opts?:{field?:string;equals?:string;notNull?:string;dateField?:string;ignorePeriod?:boolean}):Promise<number|null>{
   let request=supabase.from(table).select("id",{head:true,count:"exact"}).eq("tenant_id",tenantId!);
   if(opts?.field&&opts?.equals)request=request.eq(opts.field,opts.equals);
   if(opts?.notNull)request=request.not(opts.notNull,"is",null);
   if(since&&!opts?.ignorePeriod)request=request.gte(opts?.dateField??"created_at",since);
   const result=await request;
   return result.error?null:result.count??0;
  }
  void (async()=>{
   const [web,conversations,contacts,opportunities,quotations,orders,deliveries,activeAgents,drafts,aiRuns,allowed]=await Promise.all([
    period==="all"?Promise.resolve(null):supabase.rpc("marketing_behavior_overview",{p_tenant_id:tenantId,p_days:Number(period)}),
    count("conversations"),count("contacts"),count("opportunities"),count("quotations"),
    count("orders",{field:"status",equals:"confirmed"}),
    count("deliveries",{notNull:"delivered_at",dateField:"delivered_at"}),
    count("ai_agents",{field:"status",equals:"active",ignorePeriod:true}),
    count("ai_agents",{field:"status",equals:"draft",ignorePeriod:true}),
    count("ai_agent_runs"),
    supabase.rpc("tenant_current_permissions",{p_tenant_id:tenantId})
   ]);
   if(!alive)return;
   // Web events are private. The authorized aggregate RPC is the sole browser-facing source.
   // This RPC supports 30/90 days; historical web volume is intentionally unavailable.
   const webStats=web&&!web.error?(web.data as {connected?:boolean;summary?:{pageviews?:number;clicks?:number}}|null):null;
   const visibility=webStats?.connected&&typeof webStats.summary?.pageviews==="number"?webStats.summary.pageviews:null;
   const interaction=webStats?.connected&&typeof webStats.summary?.clicks==="number"?webStats.summary.clicks:null;
   const next={visibility,interaction,conversations,contacts,opportunities,quotations,orders,ecf:null,deliveries,loyalty:null};
   setMetrics(next);setAgents(activeAgents);setDraftAgents(drafts);setRuns(aiRuns);
   if(!allowed.error)setPermissions((allowed.data??{}) as Record<string,unknown>);
   if(Object.values(next).some((x,i)=>i!==7&&i!==9&&x===null)||allowed.error)
    setError("Algunos datos no pudieron consultarse. Se muestran como «Sin dato», nunca como cero.");
  })().catch(()=>{if(alive)setError("No se pudieron consultar las estadísticas. Intenta actualizar.");})
    .finally(()=>{if(alive)setLoading(false);});
  return()=>{alive=false;};
 },[tenantId,period,reload]);
 if(!tenantId)return null;
 return <section className={styles.section} aria-labelledby="empresia-funnel-title" data-sector={sector}>
  <div className={styles.heading}>
   <div>
    <div className={styles.eyebrow}>Cerebro comercial · {tenant?.tenant_name??"Empresia"}</div>
    <h2 id="empresia-funnel-title">Embudo comercial completo</h2>
    <p>{preset.summary}. Cifras procedentes únicamente de esta empresa.</p>
   </div>
   <div className={styles.controls}>
    <label htmlFor="empresia-funnel-period">Período</label>
    <select id="empresia-funnel-period" value={period} onChange={e=>setPeriod(e.target.value as Period)}>
     <option value="30">Últimos 30 días</option><option value="90">Últimos 90 días</option><option value="all">Todo el histórico</option>
    </select>
    <button type="button" onClick={()=>setReload(v=>v+1)} disabled={loading} aria-label="Actualizar embudo">
     <RefreshCw size={17}/> Actualizar
    </button>
   </div>
  </div>
  {error&&<p role="alert" className={styles.warning}>{error}</p>}
  <div className={styles.sectorBar}>
    <div><strong>Sector: {sectorLoading?"Comprobando…":preset.name}</strong><small>Usamos las etapas y registros del espacio de trabajo activo. El nombre sectorial no modifica el pipeline ni concede permisos.</small></div>
    {canConfigure&&<div className={styles.sectorControls}>
      <label htmlFor="empresia-funnel-sector">Perfil de empresa</label>
      <select id="empresia-funnel-sector" value={sectorDraft} disabled={sectorLoading||sectorSaving} onChange={e=>setSectorDraft(e.target.value as CommercialSector)}>
        {SECTOR_KEYS.map(key=><option key={key} value={key}>{COMMERCIAL_SECTORS[key].name}</option>)}
      </select>
      <button type="button" onClick={()=>void saveSector()} disabled={sectorLoading||sectorSaving||sectorDraft===sector}>Guardar perfil</button>
    </div>}
  </div>
  {sectorNotice&&<p role="status" className={styles.warning}>{sectorNotice}</p>}
  {pipelineStages.length>0&&<div className={styles.stageMeta}><strong>Etapas reales del pipeline:</strong> {pipelineStages.join(" · ")}</div>}
  <div className={styles.chart} aria-busy={loading} aria-label="Etapas del ciclo comercial">
   {steps.map((step,i)=>{
    const value=metrics[step.key];
    const label=loading?"Cargando":value===null?"Sin dato":number(value);
    const allowed=Boolean(step.href&&step.permission&&(permissions.all===true||permissions[step.permission]===true));
    const stepName=preset.labels[step.key]??step.name;
    const content=<><span className={styles.stageName}><small>{String(i+1).padStart(2,"0")}</small>{stepName}</span><strong>{label}</strong></>;
    const style={width:String(Math.max(72,100-i*3.2))+"%"};
    return <div key={step.key} className={styles.line}>
     {allowed&&step.href
      ?<Link href={step.href} style={style} className={styles.step} title={step.hint} aria-label={stepName+": "+label+". Abrir módulo"}>{content}</Link>
      :<div style={style} className={styles.step} title={step.hint}>{content}</div>}
     <span className={styles.hint}>{step.hint}</span>
    </div>;
   })}
  </div>
  <div className={styles.insights}>
   <div><BrainCircuit size={19}/><span><strong>IA conectada al ciclo</strong><small>{agents===null?"Estado no disponible":agents+" activo(s) · "+(draftAgents===null?"borradores no disponibles":draftAgents+" en borrador")} · {runs===null?"sin datos de ejecución":runs+" ejecución(es) registradas en el período"}. Las sugerencias no se entrenan solas ni autorizan cobros.</small></span></div>
   <div><ShieldCheck size={19}/><span><strong>Validación humana para acciones sensibles</strong><small>Enviar mensajes, cambiar precios, cerrar ventas y emitir e-CF requieren permisos, evidencia y el flujo de aprobación correspondiente.</small></span></div>
  </div>
  <p className={styles.note}>El perfil elegido adapta el vocabulario, nunca cambia el tipo de dato medido. Los valores son volúmenes de actividades diferentes, no personas únicas que pasan de una etapa a otra: no equivalen a una tasa de conversión. La forma del embudo indica el proceso, no la magnitud. Visibilidad representa páginas vistas y la interacción representa clics web (30/90 días mediante agregado autorizado); no son impresiones de Meta. El histórico web aún no está disponible. e-CF y satisfacción permanecen sin cifra hasta disponer de integraciones verificables.</p>
 </section>;
}
