"use client";

import Link from "next/link";
import {useEffect,useState} from "react";
import {ArrowRight,Bot,FileText,LayoutDashboard,MessagesSquare,RefreshCw,Users,Workflow} from "lucide-react";
import {useActiveTenant} from "@/components/tenant-context";
import {supabase} from "@/lib/supabase";
import BrandLogo from "@/components/brand-logo";
import DigitalEmployeeReviewQueue from "@/components/digital-employee-review-queue";

type Metrics={contacts:number|null;opportunities:number|null;quotations:number|null;runs:number|null};
const empty:Metrics={contacts:null,opportunities:null,quotations:null,runs:null};
const links=[
 {href:"/crm/contacts",label:"Clientes",icon:Users},
 {href:"/crm/revenue",label:"Oportunidades",icon:Workflow},
 {href:"/crm/quotations",label:"Cotizaciones",icon:FileText},
 {href:"/crm/inbox",label:"Conversaciones",icon:MessagesSquare},
] as const;

export default function FamilyPowerArmCockpit(){
 const tenant=useActiveTenant();
 const tenantId=tenant?.tenant_id??null;
 const isFamily=tenant?.tenant_slug==="family-power";
 const isAdmin=isFamily&&["owner","admin"].includes(tenant?.membership_role??"");
 const [metrics,setMetrics]=useState<Metrics>({...empty});
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const [version,setVersion]=useState(0);

 useEffect(()=>{
  let alive=true;
  setMetrics({...empty});setLoading(true);setError("");
  if(!tenantId||!isFamily){setLoading(false);return()=>{alive=false;};}
  void (async()=>{
   const [contacts,opportunities,quotations,runs]=await Promise.all([
    supabase.from("contacts").select("id",{head:true,count:"exact"}).eq("tenant_id",tenantId),
    supabase.from("opportunities").select("id",{head:true,count:"exact"}).eq("tenant_id",tenantId),
    supabase.from("quotations").select("id",{head:true,count:"exact"}).eq("tenant_id",tenantId),
    supabase.from("ai_agent_runs").select("id",{head:true,count:"exact"}).eq("tenant_id",tenantId)
   ]);
   if(!alive)return;
   if(contacts.error||opportunities.error||quotations.error||runs.error){
    setError("No se pudo consultar toda la información del ARM. Comprueba tus permisos de empresa.");
   }
   setMetrics({
    contacts:contacts.error?null:contacts.count,
    opportunities:opportunities.error?null:opportunities.count,
    quotations:quotations.error?null:quotations.count,
    runs:runs.error?null:runs.count,
   });
   setLoading(false);
  })().catch(()=>{if(alive){setError("Error de conexión con la información de Family Power.");setLoading(false);}});
  return()=>{alive=false;};
 },[tenantId,isFamily,version]);

 if(!isFamily)return <main className="content"><div className="notice" role="alert">Este centro ARM pertenece exclusivamente a Family Power.</div></main>;
 return <main className="content family-power-arm" style={{maxWidth:1280,margin:"0 auto"}}>
  <header className="card" style={{background:"linear-gradient(120deg,#101115,#29272C 70%,#521920)",color:"#F7F8FA",padding:"clamp(22px,5vw,36px)",border:"1px solid #494347"}}>
   <div className="eyebrow" style={{color:"#ECEDEF"}}>Family Power · Gestión inteligente</div>
   <div style={{display:"flex",flexWrap:"wrap",alignItems:"center",justifyContent:"space-between",gap:18}}>
    <div style={{flex:"1 1 270px"}}>
     <h1 style={{color:"#FFFFFF",margin:"8px 0 12px"}}>Family Power ARM</h1>
     <p style={{color:"#E6E7E9",lineHeight:1.6}}>Resumen de clientes, ventas y cotizaciones.</p>
     <Link href="/crm" className="button primary" style={{display:"inline-flex",alignItems:"center",gap:9,marginTop:12}}><LayoutDashboard size={18}/> Entrar al CRM <ArrowRight size={16}/></Link>

    </div>
    <div style={{width:225,maxWidth:"100%"}}><BrandLogo size="login" surface="dark"/></div>
   </div>
  </header>

  {error&&<div className="notice" role="alert">{error}</div>}
  <section className="section-gap">
   <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap"}}>
    <div><div className="eyebrow">Operaciones</div><h2>Resumen de la empresa</h2></div>
    <button className="button" type="button" disabled={loading} onClick={()=>setVersion(v=>v+1)}><RefreshCw size={16}/> Actualizar</button>
   </div>
   <div className="grid two-col" style={{marginTop:14}}>
    {([
     ["Clientes",metrics.contacts],
     ["Oportunidades",metrics.opportunities],
     ["Cotizaciones",metrics.quotations],
     ["Ejecuciones registradas",metrics.runs],
    ] as const).map(([label,count])=><article className="card" key={label}>
     <div className="eyebrow">{label}</div>
     <strong style={{fontSize:30}}>{loading?"…":count??"—"}</strong>
    </article>)}
   </div>
  </section>
  <section className="section-gap card">
   <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}><h2>Accesos rápidos</h2><Link className="button" href="/crm"><LayoutDashboard size={17}/> Panel principal</Link></div>
   <div className="grid two-col" style={{marginTop:14}}>
    {links.map(({href,label,icon:Icon})=><Link className="button" key={href} href={href}><Icon size={17}/>{label}<ArrowRight size={15}/></Link>)}
   </div>
   {isAdmin&&<div className="top-actions" style={{marginTop:16}}><Link className="button primary" href="/crm/employees"><Bot size={17}/> Configurar</Link><Link className="button" href="/crm/evidence"><ClipboardCheck size={17}/> Evidencias</Link></div>}
  </section>
  {isAdmin&&tenantId&&<section className="section-gap card" aria-label="Revisión humana de agentes">
   <div className="eyebrow">Gobierno de agentes</div><h2>Cola de aprobaciones</h2>

   <DigitalEmployeeReviewQueue tenantId={tenantId} compact/>
  </section>}
 </main>;
}
