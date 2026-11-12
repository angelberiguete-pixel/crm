"use client";

import Link from "next/link";
import {useEffect,useState} from "react";
import {ClipboardList,FileText,Users,MessageCircle,Wrench,ArrowRight,RefreshCw,BarChart3,Bot,LayoutDashboard,CreditCard,ShieldCheck,Landmark,ChevronRight} from "lucide-react";
import {supabase} from "@/lib/supabase";
import {useActiveTenant} from "@/components/tenant-context";
import {useTenantBrand} from "@/components/tenant-brand-provider";
import BrandLogo from "@/components/brand-logo";
import FamilyPowerExecutiveInsights from "@/components/family-power-executive-insights";
import styles from "./family-power-dashboard.module.css";
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
 return <main className={styles.main}>
   <section className={styles.hero}>
     <div className={styles.heroText}>
       <span className={styles.eyebrow}>Panel ejecutivo · {familyPowerRoleLabel(tenant?.membership_role)}</span>
       <h1>{brand?.name??tenant?.tenant_name??"Family Power"}</h1>
       <p>Ventas, cotizaciones e instalaciones en un mismo lugar.</p>
       <div className={styles.heroActions}>
         <Link href="/crm/contacts?new=1" className={styles.primary}><Users size={17}/> Nuevo cliente <ArrowRight size={16}/></Link>
         <Link href="/crm/revenue" className={styles.ghost}><FileText size={17}/> Abrir gestión comercial</Link>
       </div>
     </div>
     <div className={styles.brand}><BrandLogo size="login" surface="dark"/></div>
   </section>
   {tenantId&&<FamilyPowerExecutiveInsights tenantId={tenantId} counts={counts} loading={loading}/>}
   <section className={styles.quick}>
    <div className={styles.heading}><div><span className={styles.eyebrow}>Accesos de trabajo</span><h2>Todo lo necesario para operar</h2></div>
      <button type="button" onClick={()=>setVersion(v=>v+1)} disabled={loading} className={styles.refresh}><RefreshCw size={16}/> Actualizar</button>
    </div>
    {error&&<p role="alert" className={styles.error}>{error}</p>}
    <div className={styles.quickGrid}>
      {links.filter(link=>permissions&&(permissions.all===true||permissions[link.permission]===true)).map(({href,title,Icon})=>
        <Link href={href} key={href} className={styles.quickItem}><span><Icon size={21}/></span><strong>{title}</strong><ChevronRight size={17}/></Link>
      )}
      {permissions&&(permissions.all===true||permissions.dashboard===true)&&<Link href="/crm/arm" className={styles.quickItem}><span><Bot size={21}/></span><strong>Equipo de IA</strong><ChevronRight size={17}/></Link>}
      {["owner","admin"].includes(tenant?.membership_role??"")&&<Link href="/crm/finanzas" className={styles.quickItem}><span><Landmark size={21}/></span><strong>Finanzas</strong><ChevronRight size={17}/></Link>}
      {["owner","admin"].includes(tenant?.membership_role??"")&&<Link href="/crm/seguridad-instalaciones" className={styles.quickItem}><span><ShieldCheck size={21}/></span><strong>Seguridad de instalaciones</strong><ChevronRight size={17}/></Link>}
      {["owner","admin"].includes(tenant?.membership_role??"")&&<Link href="/crm/pagos" className={styles.quickItem}><span><CreditCard size={21}/></span><strong>Plan y facturas de Empresia</strong><ChevronRight size={17}/></Link>}
    </div>
   </section>
   <section className={styles.statusGrid}>
     <div className={styles.status}><div><span className={styles.eyebrow}>Conexiones</span><h3>Canales de atención</h3></div><p>WhatsApp y Meta no están conectados para esta empresa. Se mostrarán mensajes cuando exista una conexión oficial verificada.</p>{permissions&&(permissions.all===true||permissions.settings===true)&&<Link href="/crm/integrations">Gestionar integraciones <ArrowRight size={14}/></Link>}</div>
     <div className={styles.status}><div><span className={styles.eyebrow}>Seguridad</span><h3>Accesos y permisos</h3></div><p>Cuentas individuales y roles delimitan el acceso del equipo a los datos de Family Power.</p>{permissions&&(permissions.all===true||permissions.settings===true)&&<Link href="/crm/settings">Ver configuración <ArrowRight size={14}/></Link>}</div>
   </section>
 </main>;
}
