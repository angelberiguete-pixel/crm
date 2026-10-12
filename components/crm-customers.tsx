"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Building2, CalendarDays, FileText, Gauge, Inbox, Pencil, Phone, Mail, Search, Target, Users } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useActiveTenant } from "@/components/tenant-context";
import styles from "@/components/crm-commercial.module.css";

type Company = {id:string;name:string;sector:string|null;city:string|null;email:string|null;phone:string|null;whatsapp_phone:string|null;website:string|null;created_at:string};
type Contact = {id:string;company_id:string|null;display_name:string;job_title:string|null;email:string|null;phone:string|null;whatsapp_phone:string|null;status:string;source:string|null;created_at:string};
type CompanyDraft = {name:string;sector:string;city:string;phone:string;whatsapp_phone:string;email:string};
type ContactDraft = {display_name:string;company_id:string;job_title:string;phone:string;whatsapp_phone:string;email:string};
const blankCompany:CompanyDraft={name:"",sector:"",city:"",phone:"",whatsapp_phone:"",email:""};
const blankContact:ContactDraft={display_name:"",company_id:"",job_title:"",phone:"",whatsapp_phone:"",email:""};
const nav=[["","Inicio",Gauge],["companies","Empresas",Building2],["contacts","Contactos",Users],["revenue","Oportunidades",Target],["inbox","Conversaciones",Inbox],["quotations","Cotizaciones",FileText],["calendar","Calendario",CalendarDays]] as const;
const statuses:Record<string,string>={lead:"Prospecto",active:"Activo",customer:"Cliente",qualified:"Calificado",inactive:"Inactivo"};
const cleanPhone=(value:string)=>value.replace(/[^\d+]/g,"");
const dateLabel=(value:string)=>{const date=new Date(value);return Number.isNaN(date.getTime())?"—":new Intl.DateTimeFormat("es-DO",{dateStyle:"medium"}).format(date);};

export default function CrmCustomers({kind}:{kind:"companies"|"contacts"}) {
 const tenant=useActiveTenant(),tenantId=tenant?.tenant_id??null,isCompany=kind==="companies";
 const [companies,setCompanies]=useState<Company[]>([]);
 const [contacts,setContacts]=useState<Contact[]>([]);
 const [search,setSearch]=useState("");
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const [feedback,setFeedback]=useState("");
 const [reload,setReload]=useState(0);
 const [showForm,setShowForm]=useState(false);
 const [editingId,setEditingId]=useState<string|null>(null);
 const [companyDraft,setCompanyDraft]=useState<CompanyDraft>({...blankCompany});
 const [contactDraft,setContactDraft]=useState<ContactDraft>({...blankContact});
 const [saving,setSaving]=useState(false);
 useEffect(()=>{
   setCompanies([]);setContacts([]);setSearch("");setError("");setFeedback("");
   setShowForm(new URLSearchParams(window.location.search).get("new")==="1");
   setEditingId(null);setCompanyDraft({...blankCompany});setContactDraft({...blankContact});
 },[tenantId,kind]);
 useEffect(()=>{
   if(!tenantId){setLoading(false);return;}
   let alive=true;setLoading(true);
   (async()=>{
     try{
       const [c,ct]=await Promise.all([
         supabase.from("companies").select("id,name,sector,city,email,phone,whatsapp_phone,website,created_at").eq("tenant_id",tenantId).order("created_at",{ascending:false}).limit(1000),
         isCompany?Promise.resolve({data:[],error:null}):supabase.from("contacts").select("id,company_id,display_name,job_title,email,phone,whatsapp_phone,status,source,created_at").eq("tenant_id",tenantId).order("created_at",{ascending:false}).limit(1000)
       ]);
       if(!alive)return;
       if(c.error||ct.error){setError("No se pudieron cargar los registros: "+(c.error?.message??ct.error?.message));return;}
       setCompanies((c.data??[]) as Company[]);setContacts((ct.data??[]) as Contact[]);setError("");
     }catch{if(alive)setError("No se pudo conectar al servidor. Intenta actualizar la página.");}
     finally{if(alive)setLoading(false);}
   })();return()=>{alive=false;};
 },[tenantId,kind,reload,isCompany]);
 const companyMap=useMemo(()=>new Map(companies.map(c=>[c.id,c.name])),[companies]);
 const companyRows=useMemo(()=>companies.filter(c=>[c.name,c.sector,c.city,c.email,c.phone,c.whatsapp_phone].join(" ").toLocaleLowerCase("es").includes(search.trim().toLocaleLowerCase("es"))),[companies,search]);
 const contactRows=useMemo(()=>contacts.filter(c=>[c.display_name,c.job_title,c.email,c.phone,c.whatsapp_phone,c.company_id?companyMap.get(c.company_id):""].join(" ").toLocaleLowerCase("es").includes(search.trim().toLocaleLowerCase("es"))),[contacts,search,companyMap]);
 function startNew(){setEditingId(null);setCompanyDraft({...blankCompany});setContactDraft({...blankContact});setFeedback("");setShowForm(true);}
 function startCompanyEdit(c:Company){setEditingId(c.id);setFeedback("");setCompanyDraft({name:c.name,sector:c.sector??"",city:c.city??"",phone:c.phone??"",whatsapp_phone:c.whatsapp_phone??"",email:c.email??""});setShowForm(true);}
 function startContactEdit(c:Contact){setEditingId(c.id);setFeedback("");setContactDraft({display_name:c.display_name,company_id:c.company_id??"",job_title:c.job_title??"",phone:c.phone??"",whatsapp_phone:c.whatsapp_phone??"",email:c.email??""});setShowForm(true);}
 async function save(e:FormEvent<HTMLFormElement>){
   e.preventDefault();if(!tenantId||saving)return;
   setSaving(true);setFeedback("");setError("");
   try{
     if(isCompany){
       const name=companyDraft.name.trim();
       if(!name)throw new Error("Escribe el nombre de la empresa.");
       const data={name,sector:companyDraft.sector.trim()||null,city:companyDraft.city.trim()||null,phone:companyDraft.phone.trim()||null,whatsapp_phone:companyDraft.whatsapp_phone.trim()||null,email:companyDraft.email.trim()||null};
       const result=editingId
         ? await supabase.from("companies").update(data).eq("tenant_id",tenantId).eq("id",editingId).select("id").maybeSingle()
         : await supabase.from("companies").insert({...data,tenant_id:tenantId});
       if(result.error)throw new Error(result.error.message);
       if(editingId&&!result.data)throw new Error("No se confirmó la actualización del registro.");
     }else{
       const display_name=contactDraft.display_name.trim();
       if(!display_name)throw new Error("Escribe el nombre del contacto.");
       const data={display_name,company_id:contactDraft.company_id||null,job_title:contactDraft.job_title.trim()||null,phone:contactDraft.phone.trim()||null,whatsapp_phone:contactDraft.whatsapp_phone.trim()||null,email:contactDraft.email.trim()||null};
       const result=editingId
         ? await supabase.from("contacts").update(data).eq("tenant_id",tenantId).eq("id",editingId).select("id").maybeSingle()
         : await supabase.from("contacts").insert({...data,tenant_id:tenantId,status:"lead",source:"manual"});
       if(result.error)throw new Error(result.error.message);
       if(editingId&&!result.data)throw new Error("No se confirmó la actualización del registro.");
     }
     setFeedback(editingId?"Cambios guardados correctamente.":isCompany?"Empresa registrada correctamente.":"Contacto registrado correctamente.");
     setEditingId(null);setShowForm(false);setCompanyDraft({...blankCompany});setContactDraft({...blankContact});setReload(n=>n+1);
   }catch(err){setFeedback("No se pudo guardar: "+(err instanceof Error?err.message:"Intenta nuevamente."));}
   finally{setSaving(false);}
 }
 return <div className="shell">
   <aside className="sidebar"><div className="brand"><strong>Look Social Media CRM</strong><span>{tenant?.tenant_name??"Clientes y contactos"}</span></div>
     <nav className="nav" aria-label="Módulos del CRM">{nav.map(([key,label,Icon])=><Link key={key} href={"/crm"+(key?"/"+key:"")} className={key===kind?"active":""}><Icon size={17}/>{label}</Link>)}</nav>
   </aside>
   <main className="content">
     <header className="topbar"><div><div className="eyebrow">Gestión comercial · {tenant?.tenant_name??"Empresa"}</div><h1>{isCompany?"Empresas":"Contactos"}</h1></div>
       <div className="top-actions"><Link className="button" href={isCompany?"/crm/contacts":"/crm/companies"}>{isCompany?"Ver contactos":"Ver empresas"}</Link><Link className="button" href="/crm/revenue">Oportunidades</Link></div>
     </header>
     {error&&<div role="alert" className="notice">{error}</div>}
     <section className="card crm-list-card">
       <div className={styles.toolRow}>
         <div><div className="eyebrow">{isCompany?"Clientes y empresas":"Personas y prospectos"}</div><h2>{isCompany?"Empresas registradas":"Contactos registrados"}</h2>
           <p className={styles.sectionIntro}>{isCompany?"Consulta y actualiza la información de tus clientes.":"Gestiona personas, empresas vinculadas y datos de contacto."}</p>
         </div>
         <button type="button" className="button primary" aria-expanded={showForm} onClick={()=>showForm?setShowForm(false):startNew()}>{showForm?"Cerrar formulario":isCompany?"+ Nueva empresa":"+ Nuevo contacto"}</button>
       </div>
       {feedback&&<div className="notice" role="status">{feedback}</div>}
       <div className="toolbar" style={{marginTop:16}}>
         <label className={styles.search}><Search size={17}/><input aria-label={isCompany?"Buscar empresas":"Buscar contactos"} value={search} onChange={e=>setSearch(e.target.value)} placeholder={isCompany?"Nombre, ciudad o teléfono":"Nombre, empresa o teléfono"}/></label>
       </div>
       {loading?<div className="loading">Cargando registros…</div>:
       (isCompany?companyRows:contactRows).length===0?<div className="empty"><strong>{search?"No se encontraron resultados":isCompany?"Aún no hay empresas":"Aún no hay contactos"}</strong><div>{search?"Prueba otra búsqueda.":"Registra el primer cliente para comenzar. No hay datos ficticios."}</div></div>:
       <div className={styles.customerGrid}>
         {isCompany?companyRows.map(c=><article key={c.id} className={"card "+styles.customerCard}>
           <h3>{c.name}</h3><p>{[c.sector,c.city].filter(Boolean).join(" · ")||"Sin sector ni ciudad"}</p>
           <span className={styles.customerBadge}>Creada: {dateLabel(c.created_at)}</span>
           <ContactLinks email={c.email} phone={c.whatsapp_phone??c.phone}/>
           <button type="button" className="button" onClick={()=>startCompanyEdit(c)}><Pencil size={15}/> Editar empresa</button>
         </article>):contactRows.map(c=><article key={c.id} className={"card "+styles.customerCard}>
           <h3>{c.display_name}</h3><p>{c.company_id?companyMap.get(c.company_id)??"Empresa no disponible":"Sin empresa"}{c.job_title?" · "+c.job_title:""}</p>
           <span className={styles.customerBadge}>{statuses[c.status]??c.status}</span>
           <ContactLinks email={c.email} phone={c.whatsapp_phone??c.phone}/>
           <button type="button" className="button" onClick={()=>startContactEdit(c)}><Pencil size={15}/> Editar contacto</button>
         </article>)}
       </div>}
     </section>
     {showForm&&<section className="card section-gap crm-entry-form" aria-labelledby="customer-editor-title">
       <h2 id="customer-editor-title">{editingId?(isCompany?"Editar empresa":"Editar contacto"):(isCompany?"Nueva empresa":"Nuevo contacto")}</h2>
       <form className="stack gap-16" onSubmit={save}>
         {isCompany?<div className="form-grid">
           <label>Nombre<input required maxLength={180} value={companyDraft.name} onChange={e=>setCompanyDraft(v=>({...v,name:e.target.value}))}/></label>
           <label>Sector<input maxLength={120} value={companyDraft.sector} onChange={e=>setCompanyDraft(v=>({...v,sector:e.target.value}))}/></label>
           <label>Ciudad<input maxLength={120} value={companyDraft.city} onChange={e=>setCompanyDraft(v=>({...v,city:e.target.value}))}/></label>
           <label>Teléfono<input type="tel" value={companyDraft.phone} onChange={e=>setCompanyDraft(v=>({...v,phone:e.target.value}))}/></label>
           <label>WhatsApp<input type="tel" value={companyDraft.whatsapp_phone} onChange={e=>setCompanyDraft(v=>({...v,whatsapp_phone:e.target.value}))}/></label>
           <label>Email<input type="email" value={companyDraft.email} onChange={e=>setCompanyDraft(v=>({...v,email:e.target.value}))}/></label>
         </div>:<div className="form-grid">
           <label>Nombre<input required maxLength={180} value={contactDraft.display_name} onChange={e=>setContactDraft(v=>({...v,display_name:e.target.value}))}/></label>
           <label>Empresa<select value={contactDraft.company_id} onChange={e=>setContactDraft(v=>({...v,company_id:e.target.value}))}><option value="">Sin empresa</option>{companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
           <label>Cargo<input maxLength={120} value={contactDraft.job_title} onChange={e=>setContactDraft(v=>({...v,job_title:e.target.value}))}/></label>
           <label>Teléfono<input type="tel" value={contactDraft.phone} onChange={e=>setContactDraft(v=>({...v,phone:e.target.value}))}/></label>
           <label>WhatsApp<input type="tel" value={contactDraft.whatsapp_phone} onChange={e=>setContactDraft(v=>({...v,whatsapp_phone:e.target.value}))}/></label>
           <label>Email<input type="email" value={contactDraft.email} onChange={e=>setContactDraft(v=>({...v,email:e.target.value}))}/></label>
         </div>}
         <div className={styles.dialogActions}><button type="button" className="button" disabled={saving} onClick={()=>setShowForm(false)}>Cancelar</button>
           <button className="button primary" disabled={saving}>{saving?"Guardando…":editingId?"Guardar cambios":isCompany?"Guardar empresa":"Guardar contacto"}</button></div>
       </form>
     </section>}
   </main>
   <nav className="mobile-nav" aria-label="Navegación principal">{nav.slice(0,5).map(([key,label,Icon])=><Link key={key} href={"/crm"+(key?"/"+key:"")} aria-current={key===kind?"page":undefined} className={key===kind?"active":""}><Icon size={19}/><span>{label}</span></Link>)}</nav>
 </div>;
}

function ContactLinks({phone,email}:{phone:string|null;email:string|null}) {
 const safePhone=phone?cleanPhone(phone):"";
 return <div className={styles.detailLinks}>
   {safePhone&&<a href={"tel:"+safePhone} aria-label={"Llamar a "+phone}><Phone size={14}/> {phone}</a>}
   {email&&<a href={"mailto:"+encodeURIComponent(email)} aria-label={"Escribir a "+email}><Mail size={14}/> {email}</a>}
   {!safePhone&&!email&&<span className="muted">Sin datos de contacto</span>}
 </div>;
}
