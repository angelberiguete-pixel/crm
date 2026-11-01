"use client";

import {useEffect,useState} from "react";
import {RefreshCw} from "lucide-react";
import {supabase} from "@/lib/supabase";
import {useActiveTenant} from "@/components/tenant-context";
const metrics=[
 {key:"contacts",label:"Clientes",table:"contacts"},
 {key:"opportunities",label:"Oportunidades",table:"opportunities"},
 {key:"quotations",label:"Cotizaciones",table:"quotations"},
 {key:"tasks",label:"Tareas",table:"tasks"},
 {key:"agents",label:"Agentes",table:"ai_agents"},
 {key:"runs",label:"Ejecuciones IA",table:"ai_agent_runs"},
] as const;
type Result=Record<string,number|null>;
export default function FamilyPowerReports({tenantId}:{tenantId:string}){
 const tenant=useActiveTenant();
 const [counts,setCounts]=useState<Result>({}),[loading,setLoading]=useState(true),[error,setError]=useState("");
 const [version,setVersion]=useState(0);
 useEffect(()=>{
  let active=true;setLoading(true);setError("");
  void Promise.all(metrics.map(async m=>{
   const result=await supabase.from(m.table).select("id",{head:true,count:"exact"}).eq("tenant_id",tenantId);
   return {key:m.key,count:result.error?null:result.count,failed:!!result.error};
  })).then(all=>{
   if(!active)return;
   setCounts(Object.fromEntries(all.map(r=>[r.key,r.count])));
   if(all.some(x=>x.failed))setError("Algunos indicadores no están disponibles.");
   setLoading(false);
  }).catch(()=>{if(active){setLoading(false);setError("No se pudieron cargar los reportes.");}});
  return()=>{active=false;};
 },[tenantId,version]);
 if(tenant?.tenant_slug!=="family-power")return null;
 return <section className="stack gap-16">
  <div className="topbar"><h1>Reportes</h1><button className="button" onClick={()=>setVersion(v=>v+1)} type="button"><RefreshCw size={16}/> Actualizar</button></div>
  {error&&<div className="notice" role="alert">{error}</div>}
  <div className="grid two-col">{metrics.map(m=><article key={m.key} className="card">
   <div className="eyebrow">{m.label}</div><strong style={{fontSize:28}}>{loading?"…":counts[m.key]??"—"}</strong>
  </article>)}</div>
 </section>;
}
