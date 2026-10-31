"use client";
import Link from "next/link";
import {useCallback,useEffect,useState} from "react";
import {supabase} from "@/lib/supabase";
import {useActiveTenant} from "@/components/tenant-context";
type Entry={user_id:string;member_email:string|null;member_role:string;signed_in_at:string;last_seen_at:string;signed_out_at:string|null;is_online:boolean;active_seconds:number};
export default function TenantSessionActivity(){
 const tenant=useActiveTenant(),id=tenant?.tenant_id??null;
 const authorized=tenant?.membership_role==="owner"||tenant?.membership_role==="admin";
 const [entries,setEntries]=useState<Entry[]>([]);
 const [busy,setBusy]=useState(true);
 const [problem,setProblem]=useState("");
 const load=useCallback(async()=>{
  if(!id||!authorized){setBusy(false);return;}
  setBusy(true);setProblem("");
  const {data,error}=await supabase.rpc("crm_tenant_member_session_report",{p_tenant_id:id});
  if(error){setProblem("No se pudo comprobar la actividad: "+error.message);setEntries([]);}
  else setEntries((data??[]) as Entry[]);
  setBusy(false);
 },[id,authorized]);
 useEffect(()=>{void load();},[load]);
 if(!authorized)return <main className="content"><h1>Actividad de sesiones</h1><p>Solo el propietario o administrador de esta empresa tiene acceso a este registro.</p></main>;
 return <main className="content" style={{maxWidth:1160,margin:"auto"}}>
  <div className="top-actions"><Link href="/crm" className="button">Volver al panel</Link><button type="button" className="button" onClick={()=>void load()}>Actualizar sesiones</button></div>
  <div className="eyebrow">ADMINISTRACIÓN · {tenant?.tenant_name}</div>
  <h1>Accesos y tiempo conectado</h1>
  <p className="muted">Se registran sesiones autenticadas al entrar a este CRM, con actualización de actividad aproximadamente cada minuto. La duración representa presencia de sesión detectada, no horas de trabajo verificadas. No se recuperan retroactivamente sesiones anteriores a esta función.</p>
  {problem&&<div className="notice" role="alert">{problem}</div>}
  {busy?<div className="loading">Consultando sesiones…</div>:<div className="card" style={{overflowX:"auto"}}>
   <table style={{width:"100%",textAlign:"left",borderCollapse:"collapse",minWidth:720}}>
    <thead><tr><th>Miembro</th><th>Rol</th><th>Inicio</th><th>Última actividad</th><th>Duración registrada</th><th>Estado</th></tr></thead>
    <tbody>{entries.map((e,i)=>{
      const dt=(v:string)=>new Intl.DateTimeFormat("es-DO",{dateStyle:"short",timeStyle:"short"}).format(new Date(v));
      const minutes=Math.max(0,Math.round(Number(e.active_seconds??0)/60));
      return <tr key={e.user_id+":"+e.signed_in_at+":"+i} style={{borderTop:"1px solid var(--border)"}}>
       <td style={{padding:12}}>{e.member_email||"Usuario autorizado"}</td>
       <td style={{padding:12}}>{e.member_role}</td>
       <td style={{padding:12}}>{dt(e.signed_in_at)}</td>
       <td style={{padding:12}}>{dt(e.last_seen_at)}</td>
       <td style={{padding:12}}>{minutes} min aprox.</td>
       <td style={{padding:12}}>{e.signed_out_at?"Sesión cerrada":e.is_online?"Actividad reciente":"Sin actividad reciente"}</td>
      </tr>;
    })}{entries.length===0&&<tr><td colSpan={6} style={{padding:16}}>Aún no hay sesiones registradas para esta empresa.</td></tr>}</tbody>
   </table></div>}
 </main>;
}
