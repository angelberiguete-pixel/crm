"use client";
import Link from "next/link";
import {useEffect,useMemo,useState} from "react";
import {ArrowRight,BarChart3,CalendarCheck,CheckCircle2,ClipboardCheck,FileText,MessagesSquare,PackageOpen,Plus,Target,TrendingUp,Users,Workflow} from "lucide-react";
import {Area,AreaChart,Bar,BarChart,CartesianGrid,ResponsiveContainer,Tooltip,XAxis,YAxis} from "recharts";
import {supabase} from "@/lib/supabase";
import styles from "./family-power-executive-insights.module.css";

type Counts={contacts:number|null;quotations:number|null;orders:number|null;opportunities:number|null};
type Item={id:string;created_at:string;status?:string};
type Source={contacts:Item[];quotations:Item[];orders:Item[];deliveries:Item[];limited:boolean};
const month=(d:Date)=>d.getUTCFullYear()+"-"+String(d.getUTCMonth()+1).padStart(2,"0");
const nowRows=()=>{const d=new Date();return Array.from({length:6},(_,i)=>{const day=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()-5+i,1));return {key:month(day),label:new Intl.DateTimeFormat("es-DO",{month:"short"}).format(day),clients:0,quotes:0,orders:0};});};
export default function FamilyPowerExecutiveInsights({tenantId,counts,loading:countsLoading}:{tenantId:string;counts:Counts;loading:boolean}){
 const [source,setSource]=useState<Source|null>(null);
 const [loading,setLoading]=useState(true),[error,setError]=useState("");
 useEffect(()=>{
  let live=true;setSource(null);setLoading(true);setError("");
  void Promise.all([
   supabase.from("contacts").select("id,created_at").eq("tenant_id",tenantId).order("created_at",{ascending:false}).limit(1000),
   supabase.from("quotations").select("id,created_at,status").eq("tenant_id",tenantId).order("created_at",{ascending:false}).limit(1000),
   supabase.from("orders").select("id,created_at,status").eq("tenant_id",tenantId).order("created_at",{ascending:false}).limit(1000),
   supabase.from("deliveries").select("id,created_at,status").eq("tenant_id",tenantId).order("created_at",{ascending:false}).limit(1000)
  ]).then(([c,q,o,d])=>{
   if(!live)return;
   if(c.error||q.error||o.error||d.error){setError("No fue posible obtener los registros para los gráficos. No mostraremos estadísticas inventadas.");return;}
   setSource({contacts:(c.data??[]) as Item[],quotations:(q.data??[]) as Item[],orders:(o.data??[]) as Item[],deliveries:(d.data??[]) as Item[],limited:[c.data,q.data,o.data,d.data].some(x=>x?.length===1000)});
  }).catch(()=>{if(live)setError("No se pudo preparar la analítica comercial.");})
  .finally(()=>{if(live)setLoading(false);});
  return()=>{live=false;};
 },[tenantId]);
 const data=useMemo(()=>{
  const rows=nowRows();
  if(!source)return rows;
  for(const [field,items] of [["clients",source.contacts],["quotes",source.quotations],["orders",source.orders]] as const){
   for(const item of items){const dt=new Date(item.created_at);if(!Number.isFinite(dt.getTime()))continue;const row=rows.find(v=>v.key===month(dt));if(row)row[field]++;}
  }
  return rows;
 },[source]);
 const categories=[
  {name:"Clientes",count:counts.contacts??0,raw:counts.contacts,href:"/crm/contacts",icon:Users,accent:"#1e7890"},
  {name:"Oportunidades",count:counts.opportunities??0,raw:counts.opportunities,href:"/crm/revenue",icon:Target,accent:"#a42a43"},
  {name:"Cotizaciones",count:counts.quotations??0,raw:counts.quotations,href:"/crm/quotations",icon:FileText,accent:"#bb7c31"},
  {name:"Pedidos",count:counts.orders??0,raw:counts.orders,href:"/crm/operations",icon:ClipboardCheck,accent:"#7465a1"}
 ];
 const ready=!loading&&!countsLoading&&!error;
 const allZero=ready&&categories.every(x=>x.raw===0);
 const next=counts.contacts===0?{label:"Registrar primer cliente",href:"/crm/contacts"}:counts.quotations===0?{label:"Preparar primera cotización",href:"/crm/quotations"}:counts.orders===0?{label:"Revisar propuestas pendientes",href:"/crm/quotations"}:{label:"Coordinar pedidos y entregas",href:"/crm/operations"};
 const totalRecords=data.some(v=>v.clients||v.quotes||v.orders);
 const bars=categories.map(x=>({name:x.name,total:x.count}));
 return <section className={styles.wrap} aria-label="Indicadores y gráficos operativos de Family Power">
  <div className={styles.titleLine}><div><span className={styles.eyebrow}>Indicadores de la operación</span><h2>Centro de control comercial</h2></div><span className={styles.dataTag}><CheckCircle2 size={15}/> Datos del CRM · no simulados</span></div>
  <div className={styles.metrics}>
   {categories.map(({name,raw,href,icon:Icon,accent})=><Link href={href} key={name} className={styles.metric} style={{borderTopColor:accent}}><div><small>{name}</small><span style={{color:accent}}><Icon size={20}/></span></div><strong>{countsLoading?"…":raw??"—"}</strong><em>Consultar módulo <ArrowRight size={13}/></em></Link>)}
  </div>
  {error&&<p className={styles.error} role="alert">{error}</p>}
  {source?.limited&&<p className={styles.error} role="alert">Existen más de 1,000 registros en un origen. Estos gráficos requieren agregación paginada para representar el total.</p>}
  {allZero&&!loading?<section className={styles.firstSteps} aria-label="Primeras operaciones de Family Power">
    <div className={styles.firstStepsHead}>
      <span className={styles.eyebrow}>Primeras operaciones</span>
      <h3>Convierte el panel en una herramienta activa</h3>
      <p>Los gráficos necesitan actividad real. Empieza por registrar un cliente y validar el catálogo antes de enviar una cotización.</p>
    </div>
    <div className={styles.firstStepGrid}>
      <Link href="/crm/contacts" className={styles.firstStep}>
        <span className={styles.firstStepIcon}><Users size={20}/></span>
        <span><strong>1 · Registrar un cliente</strong><small>Abre Clientes y guarda una ficha real.</small></span><ArrowRight size={17}/>
      </Link>
      <Link href="/crm/products" className={styles.firstStep}>
        <span className={styles.firstStepIcon}><PackageOpen size={20}/></span>
        <span><strong>2 · Verificar el catálogo</strong><small>Confirma modelo, ficha técnica y precio.</small></span><ArrowRight size={17}/>
      </Link>
      <Link href="/crm/quotations" className={styles.firstStep}>
        <span className={styles.firstStepIcon}><FileText size={20}/></span>
        <span><strong>3 · Preparar una cotización</strong><small>Solo después de validar los productos.</small></span><ArrowRight size={17}/>
      </Link>
    </div>
    <p className={styles.firstStepFoot}>Cuando existan registros, esta guía dará paso automáticamente a gráficos reales de actividad y volumen.</p>
  </section>:<div className={styles.charts}>
   <article className={styles.chartCard}><div className={styles.chartTitle}><div><span><TrendingUp size={17}/> Evolución</span><h3>Actividad de los últimos seis meses</h3></div><small>Clientes · Cotizaciones · Pedidos</small></div>
    {loading?<div className={styles.skeleton} role="status">Consultando movimientos…</div>:totalRecords?<div className={styles.plot}><ResponsiveContainer width="100%" height="100%"><AreaChart data={data} margin={{top:6,right:8,left:-17,bottom:0}}><defs><linearGradient id="fpChartClients" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#188a9d" stopOpacity={.23}/><stop offset="100%" stopColor="#188a9d" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="#edf1f5" vertical={false}/><XAxis dataKey="label" tickLine={false} axisLine={false} tick={{fontSize:12}}/><YAxis allowDecimals={false} width={36} tickLine={false} axisLine={false} tick={{fontSize:11}}/><Tooltip/><Area type="monotone" dataKey="clients" name="Clientes" stroke="#188a9d" strokeWidth={3} fill="url(#fpChartClients)"/><Area type="monotone" dataKey="quotes" name="Cotizaciones" stroke="#ae334b" strokeWidth={2.5} fill="transparent"/><Area type="monotone" dataKey="orders" name="Pedidos" stroke="#bd863f" strokeWidth={2.5} fill="transparent"/></AreaChart></ResponsiveContainer></div>:<div className={styles.empty}><BarChart3 size={31}/><strong>Tu gráfico se activará con la primera operación</strong><small>Aún no existe actividad en el período. No agregaremos números ficticios.</small></div>}
   </article>
   <article className={styles.chartCard}><div className={styles.chartTitle}><div><span><Workflow size={17}/> Proceso comercial</span><h3>Registros por etapa</h3></div><small>Volumen por módulo · no tasas de conversión</small></div>
    {countsLoading?<div className={styles.skeleton} role="status">Consultando indicadores…</div>:categories.some(v=>(v.raw??0)>0)?<div className={styles.plot}><ResponsiveContainer width="100%" height="100%"><BarChart data={bars} layout="vertical" margin={{top:12,right:12,left:1,bottom:0}}><XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} tick={{fontSize:11}}/><YAxis type="category" dataKey="name" tickLine={false} axisLine={false} width={97} tick={{fontSize:12}}/><Tooltip/><Bar dataKey="total" name="Registros" fill="#ab304a" radius={[0,6,6,0]} maxBarSize={24}/></BarChart></ResponsiveContainer></div>:<div className={styles.empty}><PackageOpen size={31}/><strong>Sin volumen para comparar</strong><small>Los registros se reflejarán aquí en cuanto el equipo comience a trabajar.</small></div>}
   </article>
  </div>
  </div>}
  <div className={styles.workflow}><div><span className={styles.eyebrow}>Ruta comercial</span><h3>De una consulta a una instalación</h3></div><div className={styles.steps}>{[{name:"Consulta",icon:MessagesSquare},{name:"Propuesta",icon:FileText},{name:"Pedido",icon:ClipboardCheck},{name:"Instalación",icon:CalendarCheck}].map((x,i)=><div key={x.name}><span><x.icon size={17}/></span><strong>{x.name}</strong>{i<3&&<ArrowRight size={15} className={styles.stepArrow}/>}</div>)}</div></div>
  <div className={styles.bottom}><div><strong>{allZero?"Todo preparado para registrar la primera venta":"Próxima acción comercial"}</strong><span>El panel se actualiza con registros verificables, no con datos decorativos.</span></div><Link href={next.href} className={styles.cta}><Plus size={15}/>{allZero?"Abrir clientes para registrar":next.label} <ArrowRight size={15}/></Link></div>
 </section>;
}
