"use client";

import Link from "next/link";
import {useEffect,useState} from "react";
import {Bot,FileText,Inbox,RefreshCw,ShieldCheck,Target,Users,Workflow} from "lucide-react";
import {useActiveTenant} from "@/components/tenant-context";
import {supabase} from "@/lib/supabase";
import BrandLogo from "@/components/brand-logo";
import FamilyPowerArmCockpit from "@/components/family-power-arm-cockpit";
import ArmOperationalBoard from "@/components/arm-operational-board";

type MetricKey="contacts"|"opportunities"|"quotations"|"conversations"|"tasks"|"automation_rules"|"ai_agents"|"ai_agent_runs";
type Agent={id:string;name:string;status:string;approval_mode:string};
type Dashboard={tenantId:string|null;counts:Record<MetricKey,number|null>;agents:Agent[]};
const metricDetails:{key:MetricKey;label:string;description:string}[]=[
 {key:"contacts",label:"Contactos",description:"Registros visibles para tu usuario"},
 {key:"opportunities",label:"Oportunidades",description:"No equivalen a ventas realizadas"},
 {key:"quotations",label:"Cotizaciones",description:"Documentos registrados, no cobros"},
 {key:"conversations",label:"Conversaciones",description:"Según los permisos de tu rol"},
 {key:"tasks",label:"Tareas",description:"Tareas registradas en el CRM"},
 {key:"automation_rules",label:"Automatizaciones",description:"Reglas creadas, no ejecuciones"},
 {key:"ai_agents",label:"Agentes IA",description:"Perfiles configurados, no necesariamente activos"},
 {key:"ai_agent_runs",label:"Ejecuciones IA",description:"Ejecuciones registradas"},
];
const emptyCounts=():Record<MetricKey,number|null>=>Object.fromEntries(metricDetails.map(m=>[m.key,null])) as Record<MetricKey,number|null>;
const links=[
 {href:"/crm/contacts",label:"Contactos",icon:Users},
 {href:"/crm/revenue",label:"Oportunidades",icon:Target},
 {href:"/crm/quotations",label:"Cotizaciones",icon:FileText},
 {href:"/crm/inbox",label:"Conversaciones",icon:Inbox},
 {href:"/crm/automations",label:"Automatizaciones",icon:Workflow},
];

export default function ArmWorkspace(){
 const tenant=useActiveTenant();
 const tenantId=tenant?.tenant_id??null;
 const isFamily=tenant?.tenant_slug==="family-power";
 const canConfigure=["owner","admin"].includes(tenant?.membership_role??"");
 const [dashboard,setDashboard]=useState<Dashboard>({tenantId:null,counts:emptyCounts(),agents:[]});
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const [revision,setRevision]=useState(0);
 useEffect(()=>{
  let alive=true;
  setDashboard({tenantId:null,counts:emptyCounts(),agents:[]});
  setError("");
  setLoading(true);
  if(!tenantId||isFamily){setLoading(false);return()=>{alive=false;};}
  void (async()=>{
   const requests=await Promise.all([
    supabase.from("contacts").select("id",{head:true,count:"exact"}).eq("tenant_id",tenantId),
    supabase.from("opportunities").select("id",{head:true,count:"exact"}).eq("tenant_id",tenantId),
    supabase.from("quotations").select("id",{head:true,count:"exact"}).eq("tenant_id",tenantId),
    supabase.from("conversations").select("id",{head:true,count:"exact"}).eq("tenant_id",tenantId),
    supabase.from("tasks").select("id",{head:true,count:"exact"}).eq("tenant_id",tenantId),
    supabase.from("automation_rules").select("id",{head:true,count:"exact"}).eq("tenant_id",tenantId),
    supabase.from("ai_agents").select("id",{head:true,count:"exact"}).eq("tenant_id",tenantId),
    supabase.from("ai_agent_runs").select("id",{head:true,count:"exact"}).eq("tenant_id",tenantId),
   ]);
   const agents=canConfigure
    ?await supabase.from("ai_agents").select("id,name,status,approval_mode").eq("tenant_id",tenantId).order("created_at",{ascending:true}).limit(25)
    :null;
   if(!alive)return;
   const counts=emptyCounts();
   requests.forEach((result,index)=>{
    counts[metricDetails[index].key]=result.error?null:result.count??0;
   });
   setDashboard({tenantId,counts,agents:agents&&!agents.error?(agents.data??[]) as Agent[]:[]});
   if(requests.some(result=>result.error)||(agents&&agents.error))
    setError("Algunos datos no pudieron consultarse. Los indicadores no disponibles se muestran como «—»; comprueba los permisos de este usuario.");
   setLoading(false);
  })().catch(()=>{if(alive){setError("No se pudo consultar el centro ARM.");setLoading(false);}});
  return()=>{alive=false;};
 },[tenantId,isFamily,canConfigure,revision]);

 if(isFamily)return <FamilyPowerArmCockpit/>;
 if(!tenantId)return <main className="content"><p role="alert">Selecciona una empresa autorizada para acceder al ARM.</p></main>;
 return <main className="content" style={{maxWidth:1280,margin:"0 auto"}}>
  <header className="card" style={{padding:"clamp(18px,4vw,32px)"}}>
   <div className="eyebrow"><ShieldCheck size={16}/> Espacio aislado por empresa</div>
   <div style={{display:"flex",justifyContent:"space-between",gap:16,alignItems:"center",flexWrap:"wrap"}}>
    <div><h1>Centro ARM · {tenant?.tenant_name}</h1><p className="muted">Relaciones, operación comercial y agentes digitales desde un solo lugar. Solo muestra datos accesibles para tu sesión.</p></div>
    <BrandLogo size="compact"/>
   </div>
  </header>
  {error&&<div className="notice" role="alert">{error}</div>}
  <section className="section-gap">
   <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
    <h2>Actividad registrada</h2>
    <button type="button" className="button" disabled={loading} onClick={()=>setRevision(v=>v+1)}><RefreshCw size={16}/> Actualizar</button>
   </div>
   <div className="grid dashboard-kpis" style={{marginTop:14}}>
    {metricDetails.map(m=><article className="card" key={m.key}>
     <div className="eyebrow">{m.label}</div>
     <strong style={{fontSize:28}}>{loading||dashboard.tenantId!==tenantId?"…":dashboard.counts[m.key]??"—"}</strong>
     <p className="muted">{m.description}</p>
    </article>)}
   </div>
  </section>
  <ArmOperationalBoard key={tenantId} tenantId={tenantId} tenantSlug={tenant?.tenant_slug??""} memberRole={tenant?.membership_role??""}/>
  <section className="section-gap card">
   <h2>Gestión empresarial</h2>
   <p className="muted">Cada módulo verifica tus permisos antes de permitir el acceso. Los datos se mantienen separados por empresa.</p>
   <div className="grid two-col" style={{marginTop:14}}>
    {links.map(item=><Link className="button" href={item.href} key={item.href}><item.icon size={16}/>{item.label}</Link>)}
    {canConfigure&&<Link className="button" href="/crm/employees"><Bot size={16}/> Configurar agentes IA</Link>}
   </div>
  </section>
  {canConfigure&&<section className="section-gap card">
   <h2>Control de agentes digitales</h2>
   <p className="muted">«Borrador» no significa que un agente esté conectado a WhatsApp ni autorizado a enviar respuestas.</p>
   {(dashboard.tenantId!==tenantId||dashboard.agents.length===0)?<p className="muted">No hay perfiles de agentes visibles o configurados para esta empresa.</p>:
    <div className="stack gap-12">{(dashboard.tenantId===tenantId?dashboard.agents:[]).map(agent=><div className="priority-item" key={agent.id}>
     <strong>{agent.name}</strong><span>Estado: {agent.status==="draft"?"Borrador":agent.status} · Aprobación: {agent.approval_mode}</span>
    </div>)}</div>}
  </section>}
 </main>;
}
