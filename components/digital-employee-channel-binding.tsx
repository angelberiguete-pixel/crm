"use client";
import {useEffect,useRef,useState} from "react";
import {supabase} from "@/lib/supabase";

type Channel={id:string;name:string;provider:string;status:string};
type Binding={id:string;agent_id:string;channel_id:string|null;is_enabled:boolean;auto_reply:boolean;trigger_mode:string};

export default function DigitalEmployeeChannelBinding({tenantId,agentId}:{tenantId:string;agentId:string|null}){
 const ref=useRef(tenantId);ref.current=tenantId;
 const [channels,setChannels]=useState<Channel[]>([]),[bindings,setBindings]=useState<Binding[]>([]);
 const [selectedChannel,setSelectedChannel]=useState("");
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false);
 const [notice,setNotice]=useState(""),[error,setError]=useState("");
 const [reload,setReload]=useState(0);
 useEffect(()=>{setSelectedChannel("");setNotice("");setError("");setChannels([]);setBindings([]);},[tenantId,agentId]);
 useEffect(()=>{
   let alive=true;setLoading(true);
   (async()=>{
     const [c,b]=await Promise.all([
       supabase.from("channels").select("id,name,provider,status")
         .eq("tenant_id",tenantId).eq("provider","whatsapp"),
       supabase.from("ai_agent_bindings").select("id,agent_id,channel_id,is_enabled,auto_reply,trigger_mode")
         .eq("tenant_id",tenantId)
     ]);
     if(!alive||ref.current!==tenantId)return;
     if(c.error||b.error)setError("No se pudieron leer los canales y vínculos del negocio.");
     else{
       setChannels((c.data??[]) as Channel[]);
       setBindings((b.data??[]) as Binding[]);
     }
     setLoading(false);
   })().catch(()=>{if(alive&&ref.current===tenantId){setError("No se pudieron consultar los canales.");setLoading(false);}});
   return()=>{alive=false;};
 },[tenantId,reload]);
 async function save(){
   if(!agentId||!selectedChannel||saving)return;
   const currentTenant=tenantId;
   const channel=channels.find(c=>c.id===selectedChannel);
   if(!channel||channel.provider!=="whatsapp"){setError("Selecciona un canal WhatsApp válido.");return;}
   setSaving(true);setNotice("");setError("");
   try{
     const existing=bindings.find(b=>b.channel_id===selectedChannel&&b.is_enabled);
     const payload={agent_id:agentId,trigger_mode:"manual",auto_reply:false,is_enabled:true,priority:100};
     // Reuse an existing enabled binding instead of creating contradictory dispatch routes.
     const request=existing
       ?supabase.from("ai_agent_bindings").update(payload).eq("id",existing.id).eq("tenant_id",tenantId).select("id").maybeSingle()
       :supabase.from("ai_agent_bindings").insert({...payload,tenant_id:tenantId,channel_id:selectedChannel}).select("id").maybeSingle();
     const result=await request;
     if(ref.current!==currentTenant)return;
     if(result.error||!result.data?.id)throw result.error??new Error("No se confirmó el vínculo.");
     setNotice("Empleado asociado a WhatsApp. Solo clasificación y revisión: no envía ni genera IA automáticamente.");
     setReload(n=>n+1);
   }catch(e){if(ref.current===currentTenant)setError("No se pudo guardar el vínculo: "+(e instanceof Error?e.message:"Error desconocido"));}
   finally{if(ref.current===currentTenant)setSaving(false);}
 }
 const selectedBinding=bindings.find(b=>b.channel_id===selectedChannel&&b.is_enabled);
 return <section className="card section-gap" style={{marginTop:18}}>
   <div className="eyebrow">Configuración por empresa · Meta</div>
   <h2>Asignar WhatsApp a un empleado digital</h2>
   <p className="muted">El WhatsApp y las conversaciones pertenecen únicamente a esta empresa. Si Meta recibe un mensaje validado, el CRM registra el contacto y propone el empleado asociado para la revisión humana. No se activan respuestas automáticas ni consumo de IA.</p>
   {loading?<p>Cargando canales…</p>:
    <div className="stack gap-12">
     <label>WhatsApp del negocio
      <select value={selectedChannel} onChange={e=>setSelectedChannel(e.target.value)}>
       <option value="">Selecciona un número / canal</option>
       {channels.map(c=><option key={c.id} value={c.id}>{c.name} · {c.status==="connected"?"Conectado":"Pendiente de Meta"}</option>)}
      </select>
     </label>
     {channels.length===0&&<p className="notice">No hay un canal WhatsApp configurado para este negocio. Solicita su conexión oficial en Canales.</p>}
     {selectedBinding&&<p className="muted">Empleado actualmente asociado: {selectedBinding.agent_id===agentId?"este empleado":"otro empleado de esta empresa"}.</p>}
     {selectedChannel&&channels.find(c=>c.id===selectedChannel)?.status!=="connected"&&
       <p className="muted">La vinculación puede guardarse, pero la recepción real seguirá bloqueada hasta validar el número con Meta.</p>}
     <button className="button primary" type="button" disabled={!agentId||!selectedChannel||saving} onClick={()=>void save()}>
       {saving?"Guardando vínculo…":"Asignar empleado a este canal"}
     </button>
    </div>}
   {notice&&<p role="status" className="notice">{notice}</p>}
   {error&&<p role="alert" className="notice">{error}</p>}
 </section>;
}
