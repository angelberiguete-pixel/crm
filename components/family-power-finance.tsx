"use client";
import Link from "next/link";
import {useEffect,useMemo,useState} from "react";
import {Activity,ArrowRight,BookOpenCheck,BrainCircuit,ClipboardCheck,Landmark,RefreshCw,ShieldAlert,TrendingUp,Wallet} from "lucide-react";
import {ResponsiveContainer,BarChart,Bar,XAxis,YAxis,Tooltip,CartesianGrid,PieChart,Pie,Cell} from "recharts";
import {supabase} from "@/lib/supabase";
import {useActiveTenant} from "@/components/tenant-context";
import styles from "./family-power-finance.module.css";

type Order={id:string;status:string;currency:string;total:number;amount_paid:number;created_at:string};
type Payment={id:string;order_id:string|null;status:string;currency:string;amount:number;received_at:string|null;created_at:string};
type Quote={id:string;status:string;currency:string;total:number;created_at:string};
type Agent={id:string;name:string;status:string};
type Data={orders:Order[];payments:Payment[];quotes:Quote[];agents:Agent[];truncated:boolean};
type View="overview"|"movements"|"accounting"|"assistant";
const colors=["#a92d48","#168b99","#e5ac55","#8b76bd","#aec1c8"];
const money=(n:number,c:string)=>new Intl.NumberFormat("es-DO",{style:"currency",currency:c,maximumFractionDigits:0}).format(n);
const formatDate=(d:string)=>new Intl.DateTimeFormat("es-DO",{dateStyle:"medium"}).format(new Date(d));
const statusName=(s:string)=>({draft:"Borrador",pending:"Pendiente",approved:"Aprobado",paid:"Pagado",confirmed:"Confirmado",delivered:"Entregado",recorded:"Anotado",verified:"Verificado"} as Record<string,string>)[s]??s;
const key=(date:string)=>new Date(date).toISOString().slice(0,7);
const since=(date:string,scope:number)=>!scope||new Date(date)>=new Date(new Date().getFullYear(),new Date().getMonth()-scope+1,1);
export default function FamilyPowerFinance(){
 const tenant=useActiveTenant(),tenantId=tenant?.tenant_id;
 const allowed=tenant?.tenant_slug==="family-power"&&["owner","admin"].includes(tenant.membership_role);
 const [data,setData]=useState<Data|null>(null),[error,setError]=useState(""),[loading,setLoading]=useState(true);
 const [reload,setReload]=useState(0),[currency,setCurrency]=useState("DOP"),[scope,setScope]=useState(6),[tab,setTab]=useState<View>("overview");
 useEffect(()=>{
  let live=true;setData(null);setError("");setLoading(true);
  if(!allowed||!tenantId){setLoading(false);return()=>{live=false;};}
  void Promise.all([
   supabase.from("orders").select("id,status,currency,total,amount_paid,created_at").eq("tenant_id",tenantId).order("created_at",{ascending:false}).limit(1000),
   supabase.from("customer_payments").select("id,order_id,status,currency,amount,received_at,created_at").eq("tenant_id",tenantId).order("created_at",{ascending:false}).limit(1000),
   supabase.from("quotations").select("id,status,currency,total,created_at").eq("tenant_id",tenantId).order("created_at",{ascending:false}).limit(1000),
   supabase.from("ai_agents").select("id,name,status").eq("tenant_id",tenantId).limit(100),
   supabase.from("tenant_settings").select("currency").eq("tenant_id",tenantId).maybeSingle()
  ]).then(([o,p,q,a,s])=>{
   if(!live)return;
   if(o.error||p.error||q.error||a.error){setError("No se pudieron consultar todos los registros. No se mostrarán cifras parciales.");return;}
   const c=String(s.data?.currency??"DOP").toUpperCase();
   setCurrency(["DOP","USD","EUR"].includes(c)?c:"DOP");
   setData({orders:(o.data??[]) as Order[],payments:(p.data??[]) as Payment[],quotes:(q.data??[]) as Quote[],agents:(a.data??[]) as Agent[],truncated:[o.data,p.data,q.data].some(v=>v?.length===1000)});
  }).catch(()=>{if(live)setError("La consulta financiera no se completó.");})
   .finally(()=>{if(live)setLoading(false);});
  return()=>{live=false;};
 },[allowed,tenantId,reload]);
 const entries=useMemo(()=>({
  orders:(data?.orders??[]).filter(v=>v.currency===currency&&since(v.created_at,scope)),
  payments:(data?.payments??[]).filter(v=>v.currency===currency&&since(v.received_at??v.created_at,scope)),
  quotes:(data?.quotes??[]).filter(v=>v.currency===currency&&since(v.created_at,scope))
 }),[data,currency,scope]);
 const totalOrders=entries.orders.reduce((s,v)=>s+Number(v.total||0),0);
 const paidInOrders=entries.orders.reduce((s,v)=>s+Number(v.amount_paid||0),0);
 const totalPayments=entries.payments.reduce((s,v)=>s+Number(v.amount||0),0);
 const totalQuotes=entries.quotes.reduce((s,v)=>s+Number(v.total||0),0);
 const trend=useMemo(()=>{
  const now=new Date();
  const rows=Array.from({length:6},(_,i)=>{
   const date=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()-5+i,1));
   return {key:date.toISOString().slice(0,7),month:new Intl.DateTimeFormat("es-DO",{month:"short"}).format(date),orders:0,payments:0};
  });
  for(const v of entries.orders){const r=rows.find(x=>x.key===key(v.created_at));if(r)r.orders+=Number(v.total||0);}
  for(const v of entries.payments){const r=rows.find(x=>x.key===key(v.received_at??v.created_at));if(r)r.payments+=Number(v.amount||0);}
  return rows;
 },[entries.orders,entries.payments]);
 const statuses=useMemo(()=>{const m=new Map<string,number>();for(const o of entries.orders)m.set(o.status,(m.get(o.status)??0)+1);return [...m].map(([name,value])=>({name:statusName(name),value}));},[entries.orders]);
 if(!allowed)return <div className="notice" role="alert">Solo la administración de Family Power puede consultar finanzas.</div>;
 return <main className={styles.page}>
  <header className={styles.hero}><div><span className={styles.eyebrow}>Family Power · Administración</span><h1><Landmark size={29}/> Finanzas y contabilidad</h1><p>Ingresos registrados, compromisos y controles financieros en una vista privada. Los gráficos usan exclusivamente registros existentes.</p></div><button type="button" className={styles.refresh} disabled={loading} onClick={()=>setReload(v=>v+1)}><RefreshCw size={16}/> Actualizar</button></header>
  <section className={styles.filters}><label>Moneda<select aria-label="Moneda de datos" value={currency} onChange={e=>setCurrency(e.target.value)}><option value="DOP">RD$ DOP</option><option value="USD">US$ USD</option><option value="EUR">€ EUR</option></select></label><label>Período<select aria-label="Período de datos" value={scope} onChange={e=>setScope(Number(e.target.value))}><option value={6}>Últimos seis meses</option><option value={0}>Todos los registros</option></select></label><span>No mezclamos monedas ni inventamos conversiones.</span></section>
  {error&&<p role="alert" className={styles.error}>{error}</p>}
  {loading?<p role="status">Consultando información financiera…</p>:data&&<>
   {data.truncated&&<p role="alert" className={styles.error}>Más de 1,000 registros en un origen. Las cifras son parciales y necesitan un reporte paginado antes de usarse para contabilidad.</p>}
   <section className={styles.kpis} aria-label="Indicadores financieros reales">
    <article><small><BookOpenCheck size={17}/> Pedidos registrados</small><strong>{money(totalOrders,currency)}</strong><span>{entries.orders.length} pedidos · no es dinero cobrado</span></article>
    <article><small><Wallet size={17}/> Pagos anotados</small><strong>{money(totalPayments,currency)}</strong><span>{entries.payments.length} registros · no conciliados con el banco</span></article>
    <article><small><TrendingUp size={17}/> Saldo de pedidos</small><strong>{money(Math.max(0,totalOrders-paidInOrders),currency)}</strong><span>Estimación según el campo amount_paid</span></article>
    <article><small><Activity size={17}/> Cotizaciones</small><strong>{money(totalQuotes,currency)}</strong><span>{entries.quotes.length} propuestas · no son ventas</span></article>
   </section>
   <nav className={styles.tabs} aria-label="Vistas de finanzas">
    {([["overview","Resumen"],["movements","Movimientos"],["accounting","Contabilidad"],["assistant","Asesor IA"]] as [View,string][]).map(([v,label])=><button type="button" key={v} className={tab===v?styles.active:""} onClick={()=>setTab(v)} aria-current={tab===v?"page":undefined}>{label}</button>)}
   </nav>
   {tab==="overview"&&<div className={styles.charts}>
     <section className={styles.panel}><h2>Actividad comercial mensual</h2><p>Pedidos frente a pagos anotados, sin asumir conciliación · {currency}</p>
      {trend.some(v=>v.orders||v.payments)?<div className={styles.chart}><ResponsiveContainer width="100%" height="100%"><BarChart data={trend} margin={{top:12,right:5,left:0,bottom:2}}><CartesianGrid vertical={false} stroke="#e8edf1"/><XAxis dataKey="month" axisLine={false} tickLine={false} tick={{fontSize:12}}/><YAxis width={55} tick={{fontSize:11}} axisLine={false} tickLine={false}/><Tooltip formatter={(value)=>money(Number(value??0),currency)}/><Bar dataKey="orders" name="Pedidos" fill="#a92d48" radius={[4,4,0,0]}/><Bar dataKey="payments" name="Pagos anotados" fill="#168b99" radius={[4,4,0,0]}/></BarChart></ResponsiveContainer></div>:<div className={styles.empty}><FileBarChart2Fallback/><strong>Sin movimientos para graficar</strong><small>Este gráfico se activará con los primeros pedidos y registros reales.</small></div>}
     </section>
     <section className={styles.panel}><h2>Estado de los pedidos</h2><p>Distribución real por etapa comercial</p>
      {statuses.length?<><div className={styles.chart}><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={statuses} dataKey="value" nameKey="name" innerRadius={66} outerRadius={93} paddingAngle={3}>{statuses.map((_,i)=><Cell key={i} fill={colors[i%colors.length]}/>)}</Pie><Tooltip/></PieChart></ResponsiveContainer></div><div className={styles.legend}>{statuses.map((v,i)=><span key={v.name}><i style={{background:colors[i%colors.length]}}/>{v.name} · {v.value}</span>)}</div></>:<div className={styles.empty}><BookOpenCheck size={30}/><strong>Sin pedidos registrados</strong><small>Sin datos, no mostramos distribuciones artificiales.</small></div>}
     </section>
   </div>}
   {tab==="movements"&&<section className={styles.panel}><h2>Movimientos registrados</h2><p>Información operativa, no extractos bancarios.</p>{entries.payments.length?<div className={styles.scroll}><table><thead><tr><th>Fecha</th><th>Estado</th><th>Importe</th><th>Relación</th></tr></thead><tbody>{entries.payments.slice(0,40).map(v=><tr key={v.id}><td>{formatDate(v.received_at??v.created_at)}</td><td>{statusName(v.status)}</td><td>{money(Number(v.amount),currency)}</td><td>{v.order_id?"Vinculado a pedido":"Sin pedido vinculado"}</td></tr>)}</tbody></table></div>:<div className={styles.empty}><Wallet size={30}/><strong>No hay pagos anotados</strong><small>Registra operaciones reales antes de analizar cobranzas.</small></div>}<Link href="/crm/operations" className={styles.link}>Abrir pedidos y facturas <ArrowRight size={15}/></Link></section>}
   {tab==="accounting"&&<section className={styles.panel}><h2>Controles para contabilidad completa</h2><p>El CRM captura operaciones comerciales; los siguientes libros requieren implementación y datos específicos.</p><div className={styles.checks}>{[
      ["Gastos y proveedores","Sin un registro de gastos no se puede calcular utilidad neta."],
      ["Cuentas por pagar","Pendiente módulo de obligaciones y vencimientos."],
      ["Conciliación bancaria","Ningún banco o pasarela está conciliado con Family Power."],
      ["Partida doble y cierres","Existe lógica contable en el ERP, pero no un libro mayor operativo."],
      ["Documentos fiscales","La emisión e-CF requiere validación DGII y aprobación humana."]
     ].map(([name,desc])=><div key={name}><ShieldAlert size={18}/><span><strong>{name}</strong><small>{desc}</small></span><em>Por integrar</em></div>)}</div></section>}
   {tab==="assistant"&&<section className={styles.panel}><div className={styles.assistantTop}><BrainCircuit size={34}/><div><h2>Asesor financiero de IA</h2><p>Recomendaciones y seguimiento bajo supervisión humana.</p></div></div><p><strong>Agentes activos en Family Power:</strong> {data.agents.filter(a=>a.status==="active").length}</p><div className={styles.ruleNotes}><strong>Revisión preliminar basada en reglas</strong><p>{entries.orders.length===0?"No hay pedidos para evaluar ingresos comerciales.":"Revisar el estado de cobro de los pedidos registrados antes de reconocer ingresos."}</p><p>{entries.payments.length===0?"No existen pagos anotados para conciliar.":"Los pagos registrados requieren confirmación con las fuentes de cobro."}</p><p>Sin gastos registrados, ninguna estimación de utilidad neta sería fiable.</p></div><small className={styles.disclaimer}>Estas observaciones no las generó un agente contable autónomo. Su configuración, revisión y permisos aún están pendientes.</small><Link href="/crm/arm" className={styles.link}>Configurar agentes <ArrowRight size={15}/></Link></section>}
   <aside className={styles.footerNote}><ClipboardCheck size={19}/><div><strong>Cifras sin maquillaje.</strong> Estos importes solo incluyen información registrada en Family Power. Los cobros de la suscripción del cliente a Empresia se consultan por separado en «Pagos y suscripción».</div></aside>
  </>}
 </main>;
}
function FileBarChart2Fallback(){return <Activity size={30}/>;}
