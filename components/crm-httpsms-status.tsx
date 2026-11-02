"use client";

import {type FormEvent,useEffect,useState} from "react";
import {MessageSquareText,RefreshCw} from "lucide-react";
import {supabase} from "@/lib/supabase";

type SmsStatus={
  tenant_id:string;configured:boolean;requested:boolean;enabled:boolean;sender_masked:string|null;
};
/** Visible to tenant admins only. API keys and webhook secrets never reach this component. */
export default function CrmHttpsmsStatus({tenantId,className}:{
  tenantId:string;className?:string;
}){
  const [status,setStatus]=useState<SmsStatus|null>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [revision,setRevision]=useState(0);
  const [name,setName]=useState("SMS comercial");
  const [phone,setPhone]=useState("");
  const [saving,setSaving]=useState(false);
  const [feedback,setFeedback]=useState("");
  useEffect(()=>{setPhone("");setName("SMS comercial");setFeedback("");},[tenantId]);
  async function requestSms(event:FormEvent){
    event.preventDefault();
    if(saving||status?.requested)return;
    const sender=phone.replace(/[\s()-]/g,"");
    if(!/^\+[1-9]\d{7,14}$/.test(sender)){
      setFeedback("Introduce el número completo, incluido el código de país.");return;
    }
    setSaving(true);setFeedback("");
    try{
      const result=await supabase.rpc("tenant_request_sms_connection",{
        p_tenant_id:tenantId,p_channel_name:name.trim(),p_sender_e164:sender
      });
      if(result.error)throw result.error;
      setPhone("");setFeedback("Solicitud registrada. Falta autorización y prueba del número.");
      setRevision(v=>v+1);
    }catch{setFeedback("No se pudo registrar la solicitud. Revisa permisos y configuración.");}
    finally{setSaving(false);}
  }
  useEffect(()=>{
    let current=true;
    setStatus(null);setError("");setLoading(true);
    supabase.rpc("tenant_sms_gateway_status",{p_tenant_id:tenantId})
      .then(({data,error:requestError})=>{
        if(!current)return;
        if(requestError){setError("El módulo SMS todavía requiere su configuración en el servidor.");return;}
        if(!data||data.tenant_id!==tenantId){setError("No se pudo validar la empresa.");return;}
        setStatus(data as SmsStatus);
      })
      .catch(()=>{if(current)setError("No se pudo consultar SMS.");})
      .finally(()=>{if(current)setLoading(false);});
    return()=>{current=false};
  },[tenantId,revision]);
  return <section className={className??"card"} aria-label="SMS mediante httpSMS">
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
      <MessageSquareText size={22} aria-hidden="true"/>
      <span className="pill">{status?.enabled?"Ruta autorizada":status?.requested?"Pendiente de verificación":"Sin conectar"}</span>
    </div>
    <h2>Mensajes SMS</h2>
    <p className="muted">Notificaciones y respuestas desde la línea Android de la empresa mediante httpSMS.</p>
    {status?.sender_masked&&<p className="muted">Línea registrada: {status.sender_masked}</p>}
    {status?.enabled&&<p className="muted">La ruta figura habilitada. El envío sigue sujeto a los permisos y controles del servidor.</p>}
    {error&&<small role="status" className="muted">{error}</small>}
    {feedback&&<small role="status" className="muted">{feedback}</small>}
    {status&&!status.requested&&<form onSubmit={e=>void requestSms(e)} style={{display:"grid",gap:8}}>
      <label>Nombre del canal<input required minLength={2} maxLength={90} value={name} onChange={e=>setName(e.target.value)}/></label>
      <label>Número SMS con código de país<input required type="tel" placeholder="+18295550100" value={phone} onChange={e=>setPhone(e.target.value)}/></label>
      <button className="button" type="submit" disabled={saving}>{saving?"Registrando…":"Solicitar conexión SMS"}</button>
    </form>}
    {!status?.enabled&&<p className="muted">Falta verificar el Android, la titularidad de la SIM, la API y la recepción de prueba. No se enviarán SMS hasta completar ese proceso. No introduzcas claves aquí.</p>}
    <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
      <button type="button" className="button" disabled={loading}
        onClick={()=>setRevision(v=>v+1)}><RefreshCw size={14}/> {loading?"Comprobando":"Actualizar"}</button>
      <a className="button" href="https://httpsms.com/settings" target="_blank"
        rel="noopener noreferrer">Configurar httpSMS</a>
    </div>
  </section>;
}
