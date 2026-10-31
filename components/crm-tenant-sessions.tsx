"use client";
import Link from "next/link";
import {useEffect,useState} from "react";
import {RefreshCw,ShieldCheck,Clock3,Users} from "lucide-react";
import {supabase} from "@/lib/supabase";
import {useActiveTenant} from "@/components/tenant-context";

type Row={
 user_id:string;member_email:string|null;member_role:string;
 signed_in_at:string;last_seen_at:string;active_seconds:number;
 signed_out_at:string|null;is_online:boolean
};
const when=new Intl.DateTimeFormat("es-DO",{dateStyle:"medium",timeStyle:"short"});
function prettySeconds(s:number){
 const secs=Math.max(0,Math.round(s||0));
 const h=Math.floor(secs/3600),m=Math.floor((secs%3600)/60);
 return h>0?h+" h "+m+" min":m>0?m+" min":secs+" s";
}
export default function CrmTenantSessions(){
 const tenant=useActiveTenant(),id=tenant?.tenant_id;
 const admin=tenant?.membership_role==="owner"||tenant?.membership_role==="admin";
 const [rows,setRows]=useState<Row[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const [version,setVersion]=useState(0);
 useEffect(()=>{
  let alive=true;setLoading(true);setError("");setRows([]);
  if(!admin||!id){setLoading(false);return()=>{alive=false};}
  void (async()=>{
   try{
    const r=await supabase.rpc("crm_tenant_member_session_report",{p_tenant_id:id});
    if(!alive)return;
    if(r.error){setError("No fue posible consultar las sesiones de esta empresa.");return;}
    setRows((r.data??[]) as Row[]);
   }catch{if(alive)setError("No se pudo consultar el historial.");}
   finally{if(alive)setLoading(false);}
  })();
  return()=>{alive=false};
 },[id,admin,version]);
 if(!admin)return <main className="content"><h1>Acceso restringido</h1><p>Solo el dueño o administrador puede consultar sesiones del equipo.</p><Link href="/crm">Volver</Link></main>;
 return <main className="content" style={{maxWidth:1220,margin:"0 auto"}}>
  <div className="top-actions" style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12}}>
   <div><div className="eyebrow"><ShieldCheck size={16}/> Administración de {tenant?.tenant_name}</div>
    <h1>Sesiones y actividad</h1><p className="muted">Ingresos de usuarios y tiempo de conexión comprobado, solo de esta empresa.</p></div>
   <button className="button" onClick={()=>setVersion(x=>x+1)}><RefreshCw size={16}/> Actualizar</button>
  </div>
  <div className="kpi-row" style={{margin:"18px 0"}}>
   <div className="card" style={{padding:20,flex:1,minWidth:180}}><Users size={20}/><p>Usuarios activos recientemente</p><h2>{loading?"…":new Set(rows.filter(x=>x.is_online).map(x=>x.user_id)).size}</h2></div>
   <div className="card" style={{padding:20,flex:1,minWidth:180}}><Clock3 size={20}/><p>Sesiones registradas</p><h2>{loading?"…":rows.length}</h2></div>
  </div>
  {error&&<div className="notice" role="alert">{error}</div>}
  {loading?<div role="status">Verificando sesiones…</div>:
   rows.length===0?<div className="card" style={{padding:25}}>Aún no hay accesos registrados desde la activación de esta medición.</div>:
   <div className="card" style={{padding:12,overflowX:"auto"}}>
    <table style={{width:"100%",borderCollapse:"collapse",textAlign:"left",minWidth:690}}>
     <thead><tr><th>Miembro</th><th>Rol</th><th>Entrada</th><th>Última actividad</th><th>Tiempo activo</th><th>Estado</th></tr></thead>
     <tbody>{rows.map((x,i)=><tr key={x.user_id+":"+x.signed_in_at+":"+i}>
      <td>{x.member_email??"Usuario "+x.user_id.slice(0,8)}</td>
      <td>{x.member_role}</td>
      <td>{when.format(new Date(x.signed_in_at))}</td>
      <td>{when.format(new Date(x.last_seen_at))}</td>
      <td>{prettySeconds(x.active_seconds)}</td>
      <td>{x.signed_out_at?"Sesión cerrada":x.is_online?"Conectado recientemente":"Sin actividad reciente"}</td>
     </tr>)}</tbody>
    </table>
   </div>}
  <p className="muted" style={{marginTop:18,fontSize:13}}>
   El tiempo activo se acumula cuando la pestaña está visible y envía señales de actividad. Una sesión sin señal reciente no se considera conectada; no implica necesariamente que haya cerrado sesión. Se conservan hasta 500 accesos recientes por empresa.
  </p>
 </main>;
}
