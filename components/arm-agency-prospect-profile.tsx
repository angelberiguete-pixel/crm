"use client";

import Link from "next/link";
import {type FormEvent,useEffect,useState} from "react";
import {BookOpen,FilePenLine,Mail,PhoneCall,RefreshCw} from "lucide-react";
import {supabase} from "@/lib/supabase";

type Profile={
 id:string;name:string;phone:string|null;email:string|null;website:string|null;
 decision_maker:string|null;service_interest:string|null;priority:number|null;
 notes:string|null;stage:string;updated_at:string;
};
type History={
 id:string;activity_type:string;summary:string;outcome:string|null;
 occurred_at:string;next_action:string|null;next_action_at:string|null;
};
const dateLabel=(value:string)=>{
 const d=new Date(value);
 return Number.isNaN(d.getTime())?"Sin fecha":new Intl.DateTimeFormat("es-DO",{dateStyle:"medium",timeStyle:"short"}).format(d);
};
const toNullable=(value:string)=>value.trim()||null;
const labels:Record<string,string>={
 decision_maker:"Responsable",service_interest:"Servicio de interés",
 priority:"Prioridad",notes:"Notas",website:"Sitio web"
};
const fieldNames=["decision_maker","service_interest","priority","notes","website"] as const;
type Editable=Pick<Profile,(typeof fieldNames)[number]>;

export default function ArmAgencyProspectProfile({tenantId,tenantSlug,prospectId,contactId,onSaved}:{
 tenantId:string;tenantSlug:string;prospectId:string;contactId?:string|null;
 onSaved?:(id:string,fields:Partial<Editable>)=>void
}){
 const [profile,setProfile]=useState<Profile|null>(null);
 const [draft,setDraft]=useState<Editable>({
  decision_maker:null,service_interest:null,priority:null,notes:null,website:null
 });
 const [events,setEvents]=useState<History[]>([]);
 const [loading,setLoading]=useState(true);
 const [saving,setSaving]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [revision,setRevision]=useState(0);

 useEffect(()=>{
  let alive=true;
  setProfile(null);setEvents([]);setLoading(true);setError("");setNotice("");
  if(tenantSlug!=="eurevector"||!prospectId){setLoading(false);return()=>{alive=false;};}
  void(async()=>{
   const access=await supabase.rpc("platform_current_access");
   if(!alive)return;
   if(access.error||(access.data as {is_platform_admin?:boolean}|null)?.is_platform_admin!==true){
    setError("No se ha autorizado la consulta de la ficha privada.");
    setLoading(false);return;
   }
   const [p,h]=await Promise.all([
    supabase.from("agency_prospects")
     .select("id,name,phone,email,website,decision_maker,service_interest,priority,notes,stage,updated_at")
     .eq("id",prospectId).maybeSingle(),
    supabase.from("agency_prospect_activities")
     .select("id,activity_type,summary,outcome,occurred_at,next_action,next_action_at")
     .eq("prospect_id",prospectId).order("occurred_at",{ascending:false}).limit(30)
   ]);
   if(!alive)return;
   if(p.error||h.error||!p.data){
    setError("No se pudo cargar la ficha: "+(p.error?.message??h.error?.message??"Prospecto no encontrado"));
   }else{
    const record=p.data as Profile;
    setProfile(record);
    setDraft({
     decision_maker:record.decision_maker,service_interest:record.service_interest,
     priority:record.priority,notes:record.notes,website:record.website
    });
    setEvents((h.data??[]) as History[]);
   }
   setLoading(false);
  })().catch(()=>{if(alive){setError("No se pudo consultar la ficha del prospecto.");setLoading(false);}});
  return()=>{alive=false;};
 },[tenantSlug,tenantId,prospectId,revision]);

 const change=(key:keyof Editable,value:Editable[keyof Editable])=>
  setDraft(prev=>({...prev,[key]:value}));
 async function save(e:FormEvent<HTMLFormElement>){
  e.preventDefault();
  if(!profile||loading||saving||tenantSlug!=="eurevector"||profile.id!==prospectId)return;
  setError("");setNotice("");
  const patch:Partial<Editable>={
   decision_maker:toNullable(draft.decision_maker??""),
   service_interest:toNullable(draft.service_interest??""),
   website:toNullable(draft.website??""),
   notes:toNullable(draft.notes??""),
   priority:draft.priority
  };
  if((patch.decision_maker?.length??0)>160||(patch.service_interest?.length??0)>500
   ||(patch.website?.length??0)>300||(patch.notes?.length??0)>5000){
   setError("Uno de los campos supera la longitud permitida.");return;
  }
  if(patch.priority != null && (!Number.isInteger(patch.priority) || patch.priority < 1 || patch.priority > 100)){
   setError("La prioridad debe ser un número entre 1 y 100.");return;
  }
  if(patch.website&&(!/^https?:\/\/\S+$/i.test(patch.website))){
   setError("La web debe comenzar por https:// o http://.");return;
  }
  const differences=fieldNames.filter(key=>patch[key]!==profile[key]);
  if(!differences.length){setNotice("No hay cambios pendientes.");return;}
  const access=await supabase.rpc("platform_current_access");
  if(access.error||(access.data as {is_platform_admin?:boolean}|null)?.is_platform_admin!==true){
   setError("La sesión ya no tiene permisos para actualizar esta ficha.");return;
  }
  setSaving(true);
  try{
   // Compare-and-swap prevents overwriting a newer edit from another session.
   // Contact details are read-only here: edit the shared contact record in CRM.
   const updated=await supabase.from("agency_prospects").update({
    ...patch,updated_at:new Date().toISOString()
   }).eq("id",prospectId).eq("updated_at",profile.updated_at)
    .select("id,updated_at").single();
   if(updated.error||updated.data?.id!==prospectId){
    throw new Error("El registro cambió o no pudo guardarse. Actualiza la ficha antes de reintentar.");
   }
   const audit=await supabase.from("agency_prospect_activities").insert({
    prospect_id:prospectId,activity_type:"note",
    summary:"Edición manual de ficha: "+differences.map(key=>labels[key]).join(", "),
    occurred_at:new Date().toISOString()
   }).select("id").single();
   onSaved?.(prospectId,patch);
   if(audit.error||!audit.data?.id){
    setNotice("Los cambios se guardaron, pero el historial no confirmó el registro de auditoría.");
   }else{
    setNotice("Ficha actualizada y cambio registrado en el historial.");
    setEvents(previous=>[{
     id:audit.data.id,prospect_id:prospectId,activity_type:"note",
     summary:"Edición manual de ficha: "+differences.map(key=>labels[key]).join(", "),
     outcome:null,occurred_at:new Date().toISOString(),next_action:null,next_action_at:null
    },...previous].slice(0,30));
   }
   setProfile({...profile,...patch,updated_at:updated.data.updated_at});
  }catch(err){
   setError("No se guardó la ficha: "+(err instanceof Error?err.message:"Error desconocido"));
  }finally{setSaving(false);}
 }
 if(tenantSlug!=="eurevector")return null;
 return <section className="card section-gap" aria-label="Ficha editable e historial del prospecto">
  <div className="eyebrow"><FilePenLine size={16}/> Ficha comercial autogestionable</div>
  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
   <h3>Datos y actividad del prospecto</h3>
   <button type="button" className="button small" disabled={loading||saving}
    onClick={()=>setRevision(n=>n+1)}><RefreshCw size={14}/> Recargar ficha</button>
  </div>
  {loading&&<p className="muted">Cargando datos y actividad…</p>}
  {error&&<div role="alert" className="notice">{error}</div>}
  {notice&&<div role="status" className="notice">{notice}</div>}
  {profile&&!loading&&<div className="stack gap-12">
   <p><strong>{profile.name}</strong> · {profile.stage}</p>
   <div className="stack gap-12">
    {profile.phone&&<a href={"tel:"+profile.phone.replace(/[^\d+]/g,"")}><PhoneCall size={15}/> {profile.phone}</a>}
    {profile.email&&<a href={"mailto:"+profile.email}><Mail size={15}/> {profile.email}</a>}
    <p className="muted">El teléfono y correo se administran desde el contacto compartido en el CRM, para evitar dos versiones distintas.</p>
    <Link href={contactId?"/crm/contacts?contactId="+encodeURIComponent(contactId):"/crm/contacts"}>{contactId?"Editar contacto vinculado en CRM":"Abrir contactos del CRM"}</Link>
   </div>
   <form className="stack gap-12" onSubmit={e=>void save(e)}>
    <div className="form-grid">
     <label>Persona encargada
      <input maxLength={160} disabled={saving} value={draft.decision_maker??""}
       onChange={e=>change("decision_maker",e.target.value)}/>
     </label>
     <label>Prioridad comercial (1–100)
      <input type="number" min={1} max={100} disabled={saving}
       value={draft.priority??""}
       onChange={e=>change("priority",e.target.value===""?null:Number(e.target.value))}/>
     </label>
     <label>Servicio de interés
      <input maxLength={500} disabled={saving} value={draft.service_interest??""}
       onChange={e=>change("service_interest",e.target.value)}/>
     </label>
     <label>Página web
      <input type="url" maxLength={300} disabled={saving}
       value={draft.website??""} placeholder="https://..."
       onChange={e=>change("website",e.target.value)}/>
     </label>
    </div>
    <label>Notas de prospección
     <textarea rows={4} maxLength={5000} disabled={saving} value={draft.notes??""}
      onChange={e=>change("notes",e.target.value)}
      placeholder="Información confirmada, necesidades y acuerdos comerciales"/>
    </label>
    <button className="button primary" disabled={saving} type="submit">
     {saving?"Guardando…":"Guardar cambios de ficha"}
    </button>
   </form>
   <div>
    <div className="eyebrow"><BookOpen size={16}/> Historial comprobable</div>
    <p className="muted">Las 30 actividades registradas más recientes. Una llamada no se registra automáticamente al pulsar el teléfono.</p>
    {!events.length&&<p className="muted">Aún no se han registrado actividades para este prospecto.</p>}
    <div className="stack gap-12">
     {events.map(a=><div key={a.id} className="priority-item">
      <strong>{a.activity_type} · {dateLabel(a.occurred_at)}</strong>
      <span>{a.summary}</span>
      {a.outcome&&<small>Resultado: {a.outcome}</small>}
      {a.next_action&&<small>Seguimiento: {a.next_action}{a.next_action_at?" · "+dateLabel(a.next_action_at):""}</small>}
     </div>)}
    </div>
   </div>
  </div>}
 </section>;
}
