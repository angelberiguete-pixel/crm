"use client";

import {useEffect,useState} from "react";
import {MessageSquareText,RefreshCw} from "lucide-react";
import {supabase} from "@/lib/supabase";

type SmsStatus={
  tenant_id:string;configured:boolean;enabled:boolean;sender_masked:string|null;
};
/** Visible to tenant admins only. API keys and webhook secrets never reach this component. */
export default function CrmHttpsmsStatus({tenantId,className}:{
  tenantId:string;className?:string;
}){
  const [status,setStatus]=useState<SmsStatus|null>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [revision,setRevision]=useState(0);
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
      <span className="pill">{status?.enabled?"Ruta autorizada":status?.configured?"Pendiente de pruebas":"Sin conectar"}</span>
    </div>
    <h2>Mensajes SMS</h2>
    <p className="muted">Notificaciones y respuestas desde la línea Android de la empresa mediante httpSMS.</p>
    {status?.sender_masked&&<p className="muted">Línea registrada: {status.sender_masked}</p>}
    {status?.enabled&&<p className="muted">La ruta figura habilitada. El envío sigue sujeto a los permisos y controles del servidor.</p>}
    {error&&<small role="status" className="muted">{error}</small>}
    {!status?.enabled&&<p className="muted">Falta verificar el Android, la titularidad de la SIM, la API y la recepción de prueba. No se enviarán SMS hasta completar ese proceso.</p>}
    <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
      <button type="button" className="button" disabled={loading}
        onClick={()=>setRevision(v=>v+1)}><RefreshCw size={14}/> {loading?"Comprobando":"Actualizar"}</button>
      <a className="button" href="https://httpsms.com/settings" target="_blank"
        rel="noopener noreferrer">Configurar httpSMS</a>
    </div>
  </section>;
}
