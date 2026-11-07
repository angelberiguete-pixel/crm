"use client";
import { useEffect, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Activity, BarChart3, Globe2, MousePointer2, Clock3, RefreshCw, Eye, MoveDown, Smartphone, ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useActiveTenant } from "@/components/tenant-context";
import styles from "./family-power-behavior-dashboard.module.css";

type Pair = { day: string; visits: number; views: number };
type Item = { [key: string]: any };
type Summary = { sessions:number; pageviews:number; clicks:number; whatsapp_clicks:number;
 forms_started:number; forms_submitted:number; avg_active_seconds:number; avg_scroll_percent:number };
type Payload = { tenant_id:string; connected:boolean; summary:Summary;
 sites:{name:string;host:string}[]; daily:Pair[]; section_dwell:Item[]; click_targets:Item[];
 countries:Item[]; devices:Item[]; sources:Item[]; scroll_depth:Item[]; click_positions:Item[]; };
const fmt=(v:number)=>new Intl.NumberFormat("es-DO").format(Number.isFinite(v)?v:0);
const secs=(v:number)=>v>=60?(v/60).toFixed(1)+" min":Math.round(v)+" s";
const byCountry=(v:string)=>({DO:"Rep. Dominicana",US:"Estados Unidos",PR:"Puerto Rico",ES:"España",MX:"México",CO:"Colombia",HT:"Haití",ND:"No identificado"} as Record<string,string>)[v]??v;
const byDevice=(v:string)=>({mobile:"Móvil",tablet:"Tableta",desktop:"Computadora"} as Record<string,string>)[v]??v;

function Bars({rows,format=fmt}:{rows:{name:string;value:number}[];format?:(v:number)=>string}){
 const max=Math.max(1,...rows.map(r=>r.value));
 if(!rows.length)return <p className={styles.blank}>Sin actividad registrada</p>;
 return <div className={styles.bars}>{rows.slice(0,7).map((r,i)=><div className={styles.barItem} key={r.name+i}>
  <div className={styles.barText}><span>{r.name}</span><strong>{format(r.value)}</strong></div>
  <div className={styles.barTrack}><div className={styles.barFill}
   style={{width:Math.max(2,Math.min(100,r.value/max*100))+"%"}}/></div>
 </div>)}</div>;
}
export default function FamilyPowerBehaviorDashboard(){
 const tenant=useActiveTenant(),tenantId=tenant?.tenant_id??"";
 const allowed=tenant?.tenant_slug==="family-power"&&["owner","admin"].includes(tenant?.membership_role??"");
 const [days,setDays]=useState<7|30|90>(30);
 const [revision,setRevision]=useState(0);
 const [state,setState]=useState<"loading"|"ready"|"error">("loading");
 const [data,setData]=useState<Payload|null>(null),[error,setError]=useState("");
 useEffect(()=>{
  let active=true;setData(null);setError("");setState("loading");
  if(!allowed||!tenantId){setState("error");return()=>{active=false;};}
  void (async()=>{
   try{
    const {data:result,error:problem}=await supabase.rpc("marketing_behavior_overview",{p_tenant_id:tenantId,p_days:days});
    if(!active)return;
    if(problem||!result||result.tenant_id!==tenantId)throw new Error(problem?.message||"No se verificó la empresa.");
    setData(result as Payload);setState("ready");
   }catch(e:unknown){if(active){setError(e instanceof Error?e.message:"No disponible");setState("error");}}
  })();
  return()=>{active=false;};
 },[allowed,tenantId,days,revision]);
 if(!allowed)return <main className={styles.page}><p className={styles.error}>Acceso exclusivo para administración Family Power.</p></main>;
 const s=data?.summary;
 const sessions=s?.sessions??0;
 const boxes=[
  {label:"Sesiones",value:fmt(sessions),icon:Activity},
  {label:"Páginas vistas",value:fmt(s?.pageviews??0),icon:Eye},
  {label:"Tiempo activo",value:secs(s?.avg_active_seconds??0),icon:Clock3},
  {label:"Interacciones",value:fmt(s?.clicks??0),icon:MousePointer2}
 ];
 const points=data?.click_positions??[];
 const maxHeat=Math.max(1,...points.map(p=>p.count));
 return <main className={styles.page}>
  <header className={styles.top}>
   <div><span className={styles.eyebrow}><BarChart3 size={15}/> FAMILY POWER · INTELIGENCIA WEB</span>
    <h1>Analítica web</h1><p>Entiende qué atrae, dónde interactúan y cuándo se van.</p></div>
   <div className={styles.actions}>
    <div className={styles.period}>{([7,30,90] as const).map(d=><button key={d}
      className={d===days?styles.selected:""} onClick={()=>setDays(d)}
      type="button" aria-pressed={d===days}>{d} días</button>)}</div>
    <a href="https://us.posthog.com/project/673237/dashboard/2228300" target="_blank" rel="noopener noreferrer" className={styles.refresh} title="Abrir el análisis avanzado de eventos">Detalles</a>
    <button type="button" className={styles.refresh} onClick={()=>setRevision(r=>r+1)}
      aria-label="Actualizar"><RefreshCw size={17}/></button>
   </div>
  </header>
  {data?.sites?.length? <div className={styles.siteRow}><Globe2 size={15}/>
   {data.sites.map(site=><span key={site.host}>{site.host}</span>)}
   <span className={sessions?styles.active:styles.pending}>
     {sessions?"Actividad recibida":"Sin eventos"}</span></div>:null}
  {state==="loading"&&<p role="status" className={styles.note}>Cargando resultados…</p>}
  {state==="error"&&<p role="alert" className={styles.error}>{error||"No se pudo cargar la analítica."}</p>}
  {state==="ready"&&data&&!data.connected&&<div className={styles.empty}>El sitio todavía no está habilitado.</div>}
  {state==="ready"&&data&&data.connected&&<>
   <div className={styles.kpis}>{boxes.map(({label,value,icon:Icon})=><div className={styles.kpi} key={label}>
    <div className={styles.kpiLabel}><span>{label}</span><Icon size={18}/></div><strong>{value}</strong>
   </div>)}</div>
   {sessions===0&&<div className={styles.empty}><Activity size={23}/><strong>Sin visitas medidas todavía</strong>
    <span>El sitio está registrado. Los gráficos recibirán datos cuando el seguimiento esté activo y el visitante lo autorice.</span></div>}
   <div className={styles.two}>
    <section className={styles.card}><div className={styles.title}><h2>Tráfico diario</h2><span>Sesiones</span></div>
     <div className={styles.chart}><ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data.daily??[]} margin={{top:8,right:10,left:-22,bottom:0}}>
       <defs><linearGradient id="fp-behavior-fill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#bd2237" stopOpacity={0.23}/>
        <stop offset="95%" stopColor="#bd2237" stopOpacity={0}/></linearGradient></defs>
       <CartesianGrid vertical={false} stroke="#e9ecef"/>
       <XAxis dataKey="day" minTickGap={18} tickLine={false} axisLine={false}
        tick={{fontSize:11,fill:"#64748b"}}/>
       <YAxis allowDecimals={false} tickLine={false} axisLine={false}
        tick={{fontSize:11,fill:"#64748b"}}/>
       <Tooltip/>
       <Area name="Sesiones" dataKey="visits" type="monotone" stroke="#bd2237"
        strokeWidth={2} fill="url(#fp-behavior-fill)" dot={false}/>
      </AreaChart></ResponsiveContainer></div>
    </section>
    <section className={styles.card}><div className={styles.title}><h2>Tiempo por sección</h2><Clock3 size={17}/></div>
     <Bars rows={(data.section_dwell??[]).map(x=>({name:String(x.section),value:x.seconds}))} format={secs}/>
    </section>
   </div>
   <div className={styles.two}>
    <section className={styles.card}><div className={styles.title}><h2>Botones más usados</h2><MousePointer2 size={17}/></div>
     <Bars rows={(data.click_targets??[]).map(x=>({name:String(x.target),value:x.count}))}/>
     <div className={styles.minis}><span>WhatsApp <strong>{fmt(s?.whatsapp_clicks??0)}</strong></span>
      <span>Formularios <strong>{fmt(s?.forms_submitted??0)}</strong></span></div>
    </section>
    <section className={styles.card}><div className={styles.title}><h2>Profundidad de lectura</h2><MoveDown size={17}/></div>
     <div className={styles.depth}>{[25,50,75,90,100].map(d=><div key={d}>
      <span>{d}%</span><div className={styles.barTrack}><div className={styles.barFill}
       style={{width:Math.min(100,((data.scroll_depth??[]).find(x=>x.depth===d)?.count??0)/Math.max(1,sessions)*100)+"%"}}/></div>
     </div>)}</div><small>Profundidad media {fmt(s?.avg_scroll_percent??0)}%</small>
    </section>
   </div>
   <div className={styles.two}>
    <section className={styles.card}><div className={styles.title}><h2>País de origen</h2><Globe2 size={17}/></div>
     <Bars rows={(data.countries??[]).map(x=>({name:byCountry(String(x.country)),value:x.sessions}))}/>
     <small>Ubicación aproximada cuando esté disponible; no se infiere.</small>
    </section>
    <section className={styles.card}><div className={styles.title}><h2>Dispositivos</h2><Smartphone size={17}/></div>
     <Bars rows={(data.devices??[]).map(x=>({name:byDevice(String(x.device)),value:x.sessions}))}/>
     <div className={styles.title}><h2>Campañas</h2></div>
     <Bars rows={(data.sources??[]).map(x=>({name:String(x.source),value:x.sessions}))}/>
    </section>
   </div>
   <section className={styles.card}><div className={styles.title}><h2>Mapa de clics</h2><span>Distribución relativa · no graba contenido</span></div>
    <div className={styles.heatmap} aria-label="Distribución agregada de clics">
     {points.map((p,i)=><i key={i} title={String(p.count)+" clics"}
      style={{left:Math.max(0,Math.min(100,p.x))+"%",top:Math.max(0,Math.min(100,p.y))+"%",
       width:(12+Math.sqrt(p.count/maxHeat)*34)+"px",height:(12+Math.sqrt(p.count/maxHeat)*34)+"px"}}/>)}
     {!points.length&&<span>Se visualizarán las zonas al recibir clics reales.</span>}
    </div>
   </section>
  </>}
  <footer className={styles.footer}><ShieldCheck size={16}/> Datos agregados, con permiso y sin nombres, mensajes ni huella digital.</footer>
 </main>;
}
