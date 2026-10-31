"use client";

import Link from "next/link";
import {useEffect,useState} from "react";
import {ClipboardList,FileText,Users,MessageCircle,Wrench,ArrowRight,RefreshCw,BarChart3} from "lucide-react";
import {supabase} from "@/lib/supabase";
import {useActiveTenant} from "@/components/tenant-context";
import {useTenantBrand} from "@/components/tenant-brand-provider";
import BrandLogo from "@/components/brand-logo";
import {familyPowerRoleLabel} from "@/lib/family-power-access";

type Counts={contacts:number|null;quotations:number|null;orders:number|null;opportunities:number|null};
const empty:Counts={contacts:null,quotations:null,orders:null,opportunities:null};
const links=[
  {href:"/crm/contacts",title:"Clientes",description:"Personas y negocios atendidos",Icon:Users,key:"contacts",permission:"contacts"},
  {href:"/crm/quotations",title:"Cotizaciones",description:"Presupuestos que requieren revisión",Icon:FileText,key:"quotations",permission:"quotations"},
  {href:"/crm/operations",title:"Trabajos e instalaciones",description:"Órdenes y seguimiento de servicios",Icon:Wrench,key:"orders",permission:"operations"},
  {href:"/crm/revenue",title:"Seguimientos",description:"Oportunidades y próximas gestiones",Icon:ClipboardList,key:"opportunities",permission:"pipeline"},
] as const;

export default function EnergyServiceDashboard(){
 const tenant=useActiveTenant();
 const brand=useTenantBrand();
 const tenantId=tenant?.tenant_id;
 const [counts,setCounts]=useState<Counts>({...empty});
 const [permissions,setPermissions]=useState<Record<string,unknown>|null>(null);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const [version,setVersion]=useState(0);
 useEffect(()=>{
   let current=true;setCounts({...empty});setPermissions(null);setLoading(true);setError("");
   if(!tenantId){setLoading(false);return()=>{current=false;};}
   void (async()=>{
     const keys=["contacts","quotations","orders","opportunities"] as const;
     const [allowed,...responses]=await Promise.all([
       supabase.rpc("tenant_current_permissions",{p_tenant_id:tenantId}),
       ...keys.map(table=>supabase.from(table).select("id",{count:"exact",head:true}).eq("tenant_id",tenantId)),
     ]);
     if(!current)return;
     const result={...empty};
     let failed=Boolean(allowed.error);
     if(!allowed.error)setPermissions((allowed.data??{}) as Record<string,unknown>);
     responses.forEach((r,i)=>{
       if(r.error){failed=true;return;}
       result[keys[i]]=typeof r.count==="number"?r.count:null;
     });
     setCounts(result);
     if(failed)setError("No se pudieron consultar todos los registros. Verifica tus permisos y vuelve a intentar.");
     setLoading(false);
   })().catch(()=>{if(current){setLoading(false);setError("No se pudo completar la consulta.");}});
   return()=>{current=false;};
 },[tenantId,version]);
 return <main className="content family-power-dashboard" style={{margin:"0 auto",maxWidth:1240}}>
   <section style={{background:"linear-gradient(115deg,#101115,#222329 68%,#4B1117)",border:"1px solid #444650",borderRadius:20,padding:"clamp(20px,5vw,38px)",color:"#F7F8FA"}}>
     <div className="eyebrow" style={{color:"#DFE1E3"}}>Panel de trabajo · {familyPowerRoleLabel(tenant?.membership_role)}</div>
     <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:18,flexWrap:"wrap"}}>
       <div style={{flex:"1 1 280px"}}>
         <h1 style={{color:"#FFFFFF",margin:"10px 0 12px"}}>{brand?.name??tenant?.tenant_name??"Family Power"}</h1>
         <p style={{color:"#E4E5E8",lineHeight:1.55,maxWidth:480}}>
           Clientes, solicitudes, cotizaciones y trabajos en un solo lugar. La información se muestra exclusivamente para esta empresa.
         </p>
         <Link className="button primary" href="/crm/inbox" style={{marginTop:12,display:"inline-flex",alignItems:"center",gap:8}}>
           <MessageCircle size={16}/> Abrir mensajes
         </Link>
       </div>
       <div style={{width:"min(100%,355px)",padding:12,background:"transparent",flex:"0 1 355px"}}>
         <BrandLogo size="login" surface="dark"/>
       </div>
     </div>
   </section>
   <section className="section-gap" aria-label="Gestión de Family Power">
     <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap"}}>
       <div><div className="eyebrow">Tu operación</div><h2>¿Qué necesitas gestionar?</h2></div>
       <button className="button" type="button" onClick={()=>setVersion(v=>v+1)} disabled={loading}>
         <RefreshCw size={16}/> Actualizar datos
       </button>
     </div>
     {error&&<div className="notice" role="alert">{error}</div>}
     <div className="grid two-col" style={{marginTop:18}}>
       {links.filter(link=>permissions&&(permissions.all===true||permissions[link.permission]===true)).map(({href,title,description,Icon,key})=><Link href={href} key={key}
         className="card" style={{display:"flex",alignItems:"center",gap:16,textDecoration:"none",borderLeft:"4px solid #D20A14"}}>
         <span style={{display:"grid",placeItems:"center",background:"#D20A1420",borderRadius:12,padding:12,color:"#D20A14"}}>
           <Icon size={26}/>
         </span>
         <span style={{display:"grid",gap:3,flex:1}}>
           <strong>{title}</strong>
           <small className="muted">{description}</small>
         </span>
         <strong style={{fontSize:26,minWidth:33,textAlign:"right"}} aria-label={"Registros de "+title}>
           {loading?"…":counts[key]??"—"}
         </strong>
         <ArrowRight size={16} aria-hidden="true"/>
       </Link>)}
     </div>
   </section>
   <section className="grid two-col section-gap">
     <div className="card">
       <div className="eyebrow">Atención al cliente</div>
       <h2>Canales de comunicación</h2>
       <p className="muted">Conecta los canales autorizados antes de recibir o enviar mensajes reales. Ninguna cuenta de WhatsApp, Instagram ni correo se activa por mostrar esta pantalla.</p>
       {permissions&&(permissions.all===true||permissions.settings===true)&&<Link href="/crm/integrations" className="button">Gestionar canales</Link>}
     </div>
     <div className="card">
       <div className="eyebrow">Equipo y acceso</div>
       <h2>Operación segura</h2>
       <p className="muted">Los usuarios deben recibir invitaciones individuales y sus permisos se revisan antes de operar. No se importan contraseñas del CRM anterior.</p>
       {permissions&&(permissions.all===true||permissions.settings===true)&&<Link href="/crm/settings" className="button">Configuración de la empresa</Link>}
     </div>
   </section>
 </main>;
}
