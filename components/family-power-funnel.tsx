"use client";

import Link from "next/link";
import {useEffect,useState} from "react";
import {RefreshCw,ShieldCheck,BrainCircuit} from "lucide-react";
import {supabase} from "@/lib/supabase";
import {useActiveTenant} from "@/components/tenant-context";
import styles from "./family-power-funnel.module.css";

const steps=[
 {key:"visibility",name:"Visibilidad",hint:"Vistas de página registradas",permission:null,href:null},
 {key:"interaction",name:"Interacción",hint:"Eventos de marketing registrados",permission:null,href:null},
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
export default function FamilyPowerFunnel(){
 const tenant=useActiveTenant();
 const tenantId=tenant?.tenant_slug==="family-power"?tenant.tenant_id:null;
 const [period,setPeriod]=useState<Period>("30");
 const [reload,setReload]=useState(0);
 const [metrics,setMetrics]=useState<Metrics>(empty);
 const [permissions,setPermissions]=useState<Record<string,unknown>>({});
 const [agents,setAgents]=useState<number|null>(null);
 const [draftAgents,setDraftAgents]=useState<number|null>(null);
 const [runs,setRuns]=useState<number|null>(null);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
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
   const [visibility,interaction,conversations,contacts,opportunities,quotations,orders,deliveries,activeAgents,drafts,aiRuns,allowed]=await Promise.all([
    count("marketing_behavior_events",{field:"event_name",equals:"page_view"}),
    count("marketing_event_ledger"),
    count("conversations"),count("contacts"),count("opportunities"),count("quotations"),
    count("orders",{field:"status",equals:"confirmed"}),
    count("deliveries",{notNull:"delivered_at",dateField:"delivered_at"}),
    count("ai_agents",{field:"status",equals:"active",ignorePeriod:true}),
    count("ai_agents",{field:"status",equals:"draft",ignorePeriod:true}),
    count("ai_agent_runs"),
    supabase.rpc("tenant_current_permissions",{p_tenant_id:tenantId})
   ]);
   if(!alive)return;
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
 return <section className={styles.section} aria-labelledby="family-funnel-title">
  <div className={styles.heading}>
   <div>
    <div className={styles.eyebrow}>Estadísticas · Family Power</div>
    <h2 id="family-funnel-title">Embudo comercial completo</h2>
    <p>De la visibilidad al seguimiento posventa. Cada cifra procede de registros de esta empresa.</p>
   </div>
   <div className={styles.controls}>
    <label htmlFor="family-funnel-period">Período</label>
    <select id="family-funnel-period" value={period} onChange={e=>setPeriod(e.target.value as Period)}>
     <option value="30">Últimos 30 días</option><option value="90">Últimos 90 días</option><option value="all">Todo el histórico</option>
    </select>
    <button type="button" onClick={()=>setReload(v=>v+1)} disabled={loading} aria-label="Actualizar embudo">
     <RefreshCw size={17}/> Actualizar
    </button>
   </div>
  </div>
  {error&&<p role="alert" className={styles.warning}>{error}</p>}
  <div className={styles.chart} aria-busy={loading} aria-label="Etapas del ciclo comercial">
   {steps.map((step,i)=>{
    const value=metrics[step.key];
    const label=loading?"Cargando":value===null?"Sin dato":number(value);
    const allowed=Boolean(step.href&&step.permission&&(permissions.all===true||permissions[step.permission]===true));
    const content=<><span className={styles.stageName}><small>{String(i+1).padStart(2,"0")}</small>{step.name}</span><strong>{label}</strong></>;
    const style={width:String(Math.max(72,100-i*3.2))+"%"};
    return <div key={step.key} className={styles.line}>
     {allowed&&step.href
      ?<Link href={step.href} style={style} className={styles.step} title={step.hint} aria-label={step.name+": "+label+". Abrir módulo"}>{content}</Link>
      :<div style={style} className={styles.step} title={step.hint}>{content}</div>}
     <span className={styles.hint}>{step.hint}</span>
    </div>;
   })}
  </div>
  <div className={styles.insights}>
   <div><BrainCircuit size={19}/><span><strong>IA conectada al ciclo</strong><small>{agents===null?"Estado no disponible":agents+" activo(s) · "+(draftAgents===null?"borradores no disponibles":draftAgents+" en borrador")} · {runs===null?"sin datos de ejecución":runs+" ejecución(es) registradas en el período"}. Las sugerencias no se entrenan solas ni autorizan cobros.</small></span></div>
   <div><ShieldCheck size={19}/><span><strong>Validación humana para acciones sensibles</strong><small>Enviar mensajes, cambiar precios, cerrar ventas y emitir e-CF requieren permisos, evidencia y el flujo de aprobación correspondiente.</small></span></div>
  </div>
  <p className={styles.note}>Los valores son volúmenes de actividades diferentes, no personas únicas que pasan de una etapa a otra: no equivalen a una tasa de conversión. La forma del embudo indica el proceso, no la magnitud. Visibilidad significa páginas vistas instrumentadas, no impresiones de Meta. e-CF y satisfacción permanecen sin cifra hasta disponer de integraciones verificables.</p>
 </section>;
}
