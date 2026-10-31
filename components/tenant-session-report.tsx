"use client";

import Link from "next/link";
import {useCallback,useEffect,useState} from "react";
import {RefreshCw,Users} from "lucide-react";
import {supabase} from "@/lib/supabase";
import {useActiveTenant} from "@/components/tenant-context";

type SessionRow={
  user_id:string;
  member_email:string|null;
  member_role:string;
  signed_in_at:string;
  last_seen_at:string;
  active_seconds:number;
  signed_out_at:string|null;
  is_online:boolean;
};
const formatTime=(value:string|null)=>value
  ? new Intl.DateTimeFormat("es-DO",{dateStyle:"short",timeStyle:"short"}).format(new Date(value))
  : "—";
function formatActiveSeconds(value:number) {
  const minutes=Math.max(0,Math.floor(Number(value||0)/60));
  const seconds=Math.max(0,Math.floor(Number(value||0)%60));
  return minutes>0 ? `${minutes} min ${seconds} s` : `${seconds} s`;
}

export default function TenantSessionReport(){
  const tenant=useActiveTenant();
  const tenantId=tenant?.tenant_id??null;
  const permitted=["owner","admin"].includes(tenant?.membership_role??"");
  const [rows,setRows]=useState<SessionRow[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [revision,setRevision]=useState(0);
  const refresh=useCallback(()=>setRevision(x=>x+1),[]);

  useEffect(()=>{
    let alive=true;
    setRows([]);setError("");
    if(!tenantId||!permitted){setLoading(false);return()=>{alive=false;};}
    setLoading(true);
    void (async()=>{
      try {
        const {data,error:rpcError}=await supabase.rpc("crm_tenant_member_session_report",{p_tenant_id:tenantId});
        if(!alive)return;
        if(rpcError){setError("No se pudo consultar el historial de sesiones autorizado.");return;}
        setRows((data??[]) as SessionRow[]);
      } catch {
        if(alive)setError("No se pudo consultar el historial de sesiones autorizado.");
      } finally {
        if(alive)setLoading(false);
      }
    })();
    return()=>{alive=false;};
  },[tenantId,permitted,revision]);

  if(!permitted)return <main className="content"><div className="notice" role="alert">Solo el propietario o administrador de esta empresa puede consultar las sesiones del equipo.</div></main>;
  return <main className="content" style={{maxWidth:1400,margin:"0 auto"}}>
    <header className="topbar">
      <div><div className="eyebrow"><Users size={15}/> Administración de empresa</div>
        <h1>Sesiones del equipo</h1><p className="muted">Historial de accesos registrado para {tenant?.tenant_name}.</p></div>
      <div className="top-actions"><Link className="button" href="/crm">Volver al inicio</Link>
        <button type="button" className="button" onClick={refresh} disabled={loading}><RefreshCw size={15}/> Actualizar</button></div>
    </header>
    <div className="notice" style={{marginBottom:16}}>
      La actividad es aproximada: se registra al utilizar el CRM en una pestaña visible. Una sesión se considera en línea si tuvo actividad en los últimos dos minutos; cerrar el navegador sin conexión puede impedir registrar el cierre explícito.
    </div>
    {loading&&<p role="status">Comprobando sesiones autorizadas…</p>}
    {error&&<div className="notice" role="alert">{error}</div>}
    {!loading&&!error&&rows.length===0&&<div className="card">Todavía no se han registrado sesiones para esta empresa.</div>}
    {!loading&&!error&&rows.length>0&&
      <div className="card" style={{overflowX:"auto"}}>
        <table aria-label="Historial de sesiones del equipo" style={{width:"100%",minWidth:760}}>
          <thead><tr><th>Usuario</th><th>Rol</th><th>Ingreso</th><th>Última actividad</th><th>Tiempo registrado</th><th>Estado</th></tr></thead>
          <tbody>{rows.map((session,index)=><tr key={session.user_id+"-"+session.signed_in_at+"-"+index}>
            <td>{session.member_email||"Usuario autorizado"}</td>
            <td>{session.member_role}</td>
            <td>{formatTime(session.signed_in_at)}</td>
            <td>{formatTime(session.last_seen_at)}</td>
            <td>{formatActiveSeconds(session.active_seconds)}</td>
            <td>{session.signed_out_at?"Sesión cerrada":session.is_online?"En línea":"Sin actividad reciente"}</td>
          </tr>)}</tbody>
        </table>
      </div>}
  </main>;
}
