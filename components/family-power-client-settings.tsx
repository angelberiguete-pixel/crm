"use client";
import Link from "next/link";
import {useEffect,useState} from "react";
import {FileText,ShieldCheck,Users,PlugZap} from "lucide-react";
import {useActiveTenant} from "@/components/tenant-context";
import {supabase} from "@/lib/supabase";

type Settings={brand_name:string|null;currency:string;timezone:string;support_email:string|null};
export default function FamilyPowerClientSettings(){
 const tenant=useActiveTenant(),tenantId=tenant?.tenant_id;
 const allowed=tenant?.tenant_slug==="family-power"&&["owner","admin"].includes(tenant?.membership_role??"");
 const [info,setInfo]=useState<Settings|null>(null),[error,setError]=useState("");
 useEffect(()=>{
   let alive=true;setInfo(null);setError("");
   if(!tenantId||!allowed)return()=>{alive=false;};
   void supabase.from("tenant_settings").select("brand_name,currency,timezone,support_email")
    .eq("tenant_id",tenantId).maybeSingle().then(({data,error:err})=>{
      if(!alive)return;
      if(err)setError("No se pudo consultar la configuración autorizada.");
      else setInfo(data as Settings|null);
    }).catch(()=>{if(alive)setError("No se pudo consultar la configuración autorizada.");});
   return()=>{alive=false;};
 },[tenantId,allowed]);
 if(!allowed)return <div className="notice" role="alert">Solo administración autorizada de Family Power.</div>;
 return <div className="stack gap-16">
  <header><div className="eyebrow">Family Power · Administración</div><h1>Configuración de la empresa</h1>
    <p className="muted">Las opciones de marca blanca y plataforma se administran desde el panel general de Ángel Berigüete.</p></header>
  {error&&<div className="notice" role="alert">{error}</div>}
  <div className="grid two-col">
   <section className="card"><h2><ShieldCheck size={19}/> Identidad corporativa</h2>
    <p className="muted">Logo y colores oficiales de Family Power, protegidos contra cambios involuntarios.</p>
    <div className="priority-list">
     <div className="priority-item"><strong>Moneda</strong><span>{info?.currency??"Consultando…"}</span></div>
     <div className="priority-item"><strong>Zona horaria</strong><span>{info?.timezone??"Consultando…"}</span></div>
     <div className="priority-item"><strong>Correo de contacto</strong><span>{info?.support_email??"Por confirmar"}</span></div>
    </div>
   </section>
   <section className="card"><h2><Users size={19}/> Equipo autorizado</h2>
    <p className="muted">Historial de sesiones, presencia aproximada y acceso autorizado.</p>
    <Link href="/crm/sessions" className="button">Ver sesiones</Link>
   </section>
   <section className="card"><h2><PlugZap size={19}/> WhatsApp e integraciones</h2>
    <p className="muted">Consulta las conexiones y solicita autorización sin pegar claves en el navegador.</p>
    <Link href="/crm/integrations" className="button">Abrir conexiones</Link>
   </section>
   <section className="card"><h2><FileText size={19}/> Operación</h2>
    <p className="muted">Tus contactos y cotizaciones permanecen dentro del CRM privado.</p>
    <div className="top-actions"><Link href="/crm/contacts" className="button">Clientes</Link>
    <Link href="/crm/quotations" className="button">Cotizaciones</Link></div>
   </section>
  </div>
 </div>;
}
