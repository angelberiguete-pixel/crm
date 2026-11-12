"use client";

import {useEffect,useState} from "react";
import {Activity,Bot,ClipboardList,RefreshCw} from "lucide-react";
import {supabase} from "@/lib/supabase";
import {useActiveTenant} from "@/components/tenant-context";
import FamilyPowerExecutiveInsights from "@/components/family-power-executive-insights";

const metrics=[
 {key:"contacts",table:"contacts"},{key:"opportunities",table:"opportunities"},
 {key:"quotations",table:"quotations"},{key:"orders",table:"orders"},
 {key:"tasks",table:"tasks"},{key:"agents",table:"ai_agents"},{key:"runs",table:"ai_agent_runs"}
] as const;
type Result=Record<string,number|null>;
export default function FamilyPowerReports({tenantId}:{tenantId:string}){
 const tenant=useActiveTenant();
 const [counts,setCounts]=useState<Result>({}),[loading,setLoading]=useState(true),[error,setError]=useState("");
 const [revision,setRevision]=useState(0);
 useEffect(()=>{
  let alive=true;setLoading(true);setError("");setCounts({});
  void Promise.all(metrics.map(async m=>{
   const r=await supabase.from(m.table).select("id",{head:true,count:"exact"}).eq("tenant_id",tenantId);
   return {key:m.key,count:r.error?null:r.count,failed:!!r.error};
  })).then(all=>{
   if(!alive)return;
   setCounts(Object.fromEntries(all.map(r=>[r.key,r.count])));
   if(all.some(x=>x.failed))setError("Algunos datos no están disponibles; no se muestran cifras inventadas.");
   setLoading(false);
  }).catch(()=>{if(alive){setLoading(false);setError("No se pudieron cargar los reportes.");}});
  return()=>{alive=false;};
 },[tenantId,revision]);
 if(tenant?.tenant_slug!=="family-power")return null;
 return <section className="stack gap-16" aria-label="Reportes de Family Power">
  <header className="topbar"><div><div className="eyebrow">Family Power · Analítica de operaciones</div><h1>Reportes visuales</h1><p className="muted">Actividad real y trazable de cada módulo.</p></div><button type="button" className="button" disabled={loading} onClick={()=>setRevision(v=>v+1)}><RefreshCw size={16}/> Actualizar</button></header>
  {error&&<div className="notice" role="alert">{error}</div>}
  <FamilyPowerExecutiveInsights tenantId={tenantId} counts={{contacts:counts.contacts??null,opportunities:counts.opportunities??null,quotations:counts.quotations??null,orders:counts.orders??null}} loading={loading}/>
  <section className="grid two-col" aria-label="Equipo y agentes"><article className="card"><div className="eyebrow"><ClipboardList size={15}/> Tareas del equipo</div><strong style={{fontSize:28,color:"#a13049"}}>{loading?"…":counts.tasks??"—"}</strong><p className="muted">Tareas registradas por usuarios autorizados.</p></article><article className="card"><div className="eyebrow"><Bot size={15}/> Agentes configurados</div><strong style={{fontSize:28,color:"#21869a"}}>{loading?"…":counts.agents??"—"}</strong><p className="muted"><Activity size={13}/> {loading?"…":counts.runs??"—"} ejecuciones registradas, no simuladas.</p></article></section>
 </section>;
}
