"use client";

import {type FormEvent,useEffect,useState} from "react";
import {supabase} from "@/lib/supabase";
import {useActiveTenant} from "@/components/tenant-context";

type Contact={
 id:string;display_name:string;job_title:string|null;email:string|null;
 phone:string|null;whatsapp_phone:string|null;
};
const blank:Contact={id:"",display_name:"",job_title:null,email:null,phone:null,whatsapp_phone:null};
const trimmed=(s:string)=>s.trim()||null;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function CrmContactEditor({tenantId,contactId,onSaved,onClose}:{
 tenantId:string;contactId:string;onSaved:()=>void;onClose:()=>void
}){
 const tenant=useActiveTenant();
 const [record,setRecord]=useState<Contact|null>(null);
 const [draft,setDraft]=useState<Contact>(blank);
 const [loading,setLoading]=useState(true);
 const [saving,setSaving]=useState(false);
 const [allowed,setAllowed]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [reload,setReload]=useState(0);
 const active=tenant?.tenant_id===tenantId;
 useEffect(()=>{
  let alive=true;
  setLoading(true);setAllowed(false);setRecord(null);setDraft(blank);setError("");setNotice("");
  if(!active||!uuid.test(contactId)){setError("Contacto o empresa no válidos.");setLoading(false);return()=>{alive=false;};}
  void(async()=>{
   const [permissions,modules]=await Promise.all([
    supabase.rpc("tenant_current_permissions",{p_tenant_id:tenantId}),
    supabase.rpc("tenant_effective_modules",{p_tenant_id:tenantId})
   ]);
   if(!alive)return;
   const p=(permissions.data??{}) as Record<string,unknown>;
   const m=(modules.data??[]) as Array<{module_key:string;enabled:boolean}>;
   const canRead=!permissions.error&&!modules.error
    &&(p.all===true||p.contacts===true)
    &&m.find(x=>x.module_key==="contacts")?.enabled!==false;
   if(!canRead){
    setError("El módulo de contactos no está permitido en esta cuenta.");
    setLoading(false);return;
   }
   const response=await supabase.from("contacts")
    .select("id,display_name,job_title,email,phone,whatsapp_phone")
    .eq("tenant_id",tenantId).eq("id",contactId).maybeSingle();
   if(!alive)return;
   if(response.error||!response.data)setError(response.error?.message??"Contacto no encontrado o sin permiso.");
   else{
    setRecord(response.data as Contact);
    setDraft(response.data as Contact);
    setAllowed(true);
   }
   setLoading(false);
  })().catch(()=>{if(alive){setError("No fue posible consultar el contacto.");setLoading(false);}});
  return()=>{alive=false;};
 },[tenantId,contactId,active,reload]);

 async function save(e:FormEvent<HTMLFormElement>){
  e.preventDefault();
  if(!record||!allowed||!active||saving||record.id!==contactId)return;
  const display_name=draft.display_name.trim();
  const job_title=trimmed(draft.job_title??"");
  const email=trimmed(draft.email??"");
  const phone=trimmed(draft.phone??"");
  const whatsapp_phone=trimmed(draft.whatsapp_phone??"");
  if(display_name.length<2||display_name.length>160||(job_title?.length??0)>160
    ||(email?.length??0)>254||(phone?.length??0)>45||(whatsapp_phone?.length??0)>45){
   setError("Comprueba la longitud de los campos del contacto.");return;
  }
  if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
   setError("El correo electrónico no tiene un formato válido.");return;
  }
  if([email,phone,whatsapp_phone,job_title,display_name].every((v,i)=>
   v===[record.email,record.phone,record.whatsapp_phone,record.job_title,record.display_name][i])){
   setNotice("No hay cambios pendientes.");return;
  }
  setSaving(true);setError("");setNotice("");
  try{
   const permissions=await supabase.rpc("tenant_current_permissions",{p_tenant_id:tenantId});
   const p=(permissions.data??{}) as Record<string,unknown>;
   if(permissions.error||!(p.all===true||p.contacts===true)){
    throw new Error("Tu sesión ya no tiene permisos para modificar contactos.");
   }
   const update=await supabase.from("contacts").update({
    display_name,job_title,email,phone,whatsapp_phone
   }).eq("tenant_id",tenantId).eq("id",contactId).select("id").single();
   if(update.error||update.data?.id!==contactId){
    throw new Error(update.error?.message??"El CRM no confirmó la actualización.");
   }
   setRecord({id:contactId,display_name,job_title,email,phone,whatsapp_phone});
   onSaved();
   let note="Contacto actualizado en el CRM.";
   // Look's older agency prospect cache mirrors only contact coordinates.
   // This second, RLS-protected write is not atomic with the contact update.
   // Always disclose when the mirror cannot be verified.
   if(tenant?.tenant_slug==="eurevector"){
    const access=await supabase.rpc("platform_current_access");
    if(!access.error&&(access.data as {is_platform_admin?:boolean}|null)?.is_platform_admin===true){
     const opportunities=await supabase.from("opportunities")
      .select("metadata").eq("tenant_id",tenantId).eq("contact_id",contactId).limit(25);
     if(opportunities.error){
      note+=" No se pudo verificar el vínculo con la ficha de prospección.";
     }else{
      const refs=[...new Set((opportunities.data??[])
       .map(o=>(o.metadata as {agency_prospect_id?:unknown}|null)?.agency_prospect_id)
       .filter((id):id is string=>typeof id==="string"&&uuid.test(id)))];
      if(refs.length===1){
       const mirror=await supabase.from("agency_prospects")
        .update({phone,email}).eq("id",refs[0]).select("id").single();
       if(mirror.error||mirror.data?.id!==refs[0])
        note+=" La ficha privada de prospección no se pudo sincronizar; revísala por separado.";
       else
        note+=" Teléfono y correo sincronizados con su prospecto existente.";
      }else if(refs.length>1){
       note+=" Vínculo ambiguo: no se ha actualizado ninguna ficha de prospección.";
      }
     }
    }
   }
   setNotice(note);
  }catch(err){
   setError("No se pudo guardar el contacto: "+(err instanceof Error?err.message:"Error desconocido"));
  }finally{setSaving(false);}
 }
 const change=(key:keyof Contact,value:string)=>
  setDraft(prev=>({...prev,[key]:value}));
 return <section className="card section-gap" aria-label="Editar contacto existente">
  <div style={{display:"flex",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
   <h2>Editar contacto existente</h2>
   <div style={{display:"flex",gap:8}}>
    <button type="button" className="button" onClick={()=>setReload(n=>n+1)} disabled={saving||loading}>Recargar</button>
    <button type="button" className="button" onClick={onClose} disabled={saving}>Cerrar</button>
   </div>
  </div>
  {error&&<div role="alert" className="notice">{error}</div>}
  {notice&&<div role="status" className="notice">{notice}</div>}
  {loading&&<p className="muted">Verificando permisos y cargando contacto…</p>}
  {record&&!loading&&allowed&&<form onSubmit={e=>void save(e)} className="stack gap-12">
   <div className="form-grid">
    <label>Nombre público
     <input required minLength={2} maxLength={160} disabled={saving}
      value={draft.display_name} onChange={e=>change("display_name",e.target.value)}/>
    </label>
    <label>Cargo
     <input maxLength={160} disabled={saving}
      value={draft.job_title??""} onChange={e=>change("job_title",e.target.value)}/>
    </label>
    <label>Correo electrónico
     <input type="email" maxLength={254} disabled={saving}
      value={draft.email??""} onChange={e=>change("email",e.target.value)}/>
    </label>
    <label>Teléfono
     <input type="tel" maxLength={45} disabled={saving}
      value={draft.phone??""} onChange={e=>change("phone",e.target.value)}/>
    </label>
    <label>WhatsApp
     <input type="tel" maxLength={45} disabled={saving}
      value={draft.whatsapp_phone??""} onChange={e=>change("whatsapp_phone",e.target.value)}/>
    </label>
   </div>
   <button type="submit" className="button primary" disabled={saving}>{saving?"Guardando…":"Guardar contacto"}</button>
   <p className="muted">Solo se actualiza el contacto existente. Los cambios de WhatsApp aquí no activan ni envían mensajes.</p>
  </form>}
 </section>;
}
