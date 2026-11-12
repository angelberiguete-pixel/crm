"use client";
import Link from "next/link";
import {useEffect,useMemo,useState} from "react";
import {Activity,ArrowRight,Boxes,CalendarCheck,CheckCircle2,ClipboardCheck,FileText,PackageCheck,RefreshCw,ShieldAlert,ShoppingCart,Truck,Wallet,Wrench} from "lucide-react";
import {BarChart,Bar,CartesianGrid,ResponsiveContainer,Tooltip,XAxis,YAxis} from "recharts";
import {supabase} from "@/lib/supabase";
import {useActiveTenant} from "@/components/tenant-context";
import styles from "./family-power-erp-control.module.css";

type Row={id:string;created_at:string;status?:string|null};
type Product=Row&{name:string;status:string;sale_price:number|null;metadata:Record<string,unknown>|null};
type Inventory=Row&{name:string;on_hand:number;reserved:number;reorder_level:number;active:boolean};
type Data={quotes:Row[]|null;orders:Row[]|null;jobs:Row[]|null;deliveries:Row[]|null;payments:Row[]|null;products:Product[]|null;inventory:Inventory[]|null;tasks:Row[]|null;warehouses:boolean;partial:boolean};
const cap=600;
const count=(a:Row[]|null|undefined)=>a===null||a===undefined?"—":String(a.length);
function chartRows(){
 const today=new Date();
 return Array.from({length:6},(_,i)=>{const d=new Date(Date.UTC(today.getUTCFullYear(),today.getUTCMonth()-5+i,1));
  return {key:d.toISOString().slice(0,7),month:new Intl.DateTimeFormat("es-DO",{month:"short"}).format(d),quotes:0,orders:0,deliveries:0};});
}
export default function FamilyPowerErpControl(){
 const tenant=useActiveTenant(),tenantId=tenant?.tenant_id;
 const [data,setData]=useState<Data|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(""),[reload,setReload]=useState(0);
 useEffect(()=>{
  let live=true;setData(null);setLoading(true);setError("");
  if(!tenantId||tenant?.tenant_slug!=="family-power"){setLoading(false);return()=>{live=false;};}
  void (async()=>{
   const r=await Promise.all([
    supabase.from("quotations").select("id,status,created_at").eq("tenant_id",tenantId).order("created_at",{ascending:false}).limit(cap),
    supabase.from("orders").select("id,status,created_at").eq("tenant_id",tenantId).order("created_at",{ascending:false}).limit(cap),
    supabase.from("production_jobs").select("id,status,created_at").eq("tenant_id",tenantId).order("created_at",{ascending:false}).limit(cap),
    supabase.from("deliveries").select("id,status,created_at").eq("tenant_id",tenantId).order("created_at",{ascending:false}).limit(cap),
    supabase.from("customer_payments").select("id,status,created_at").eq("tenant_id",tenantId).order("created_at",{ascending:false}).limit(cap),
    supabase.from("products").select("id,name,status,sale_price,metadata,created_at").eq("tenant_id",tenantId).order("created_at",{ascending:false}).limit(cap),
    supabase.from("inventory_items").select("id,name,on_hand,reserved,reorder_level,active,created_at").eq("tenant_id",tenantId).order("created_at",{ascending:false}).limit(cap),
    supabase.from("tasks").select("id,status,created_at").eq("tenant_id",tenantId).order("created_at",{ascending:false}).limit(cap),
    supabase.from("inventory_warehouses").select("id").eq("tenant_id",tenantId).limit(1),
    supabase.from("inventory_stock_locations").select("inventory_item_id").eq("tenant_id",tenantId).limit(1)
   ]);
   if(!live)return;
   const failed=["Cotizaciones","Pedidos","Trabajos","Entregas","Pagos","Productos","Inventario","Tareas"].filter((_,i)=>r[i].error);
   if(failed.length)setError("Información no disponible: "+failed.join(", ")+". Los valores afectados no se mostrarán como cero.");
   const rows=(i:number)=>r[i].error?null:(r[i].data??[]) as Row[];
   setData({quotes:rows(0),orders:rows(1),jobs:rows(2),deliveries:rows(3),payments:rows(4),
    products:r[5].error?null:(r[5].data??[]) as Product[],
    inventory:r[6].error?null:(r[6].data??[]) as Inventory[],
    tasks:rows(7),warehouses:!r[8].error&&!r[9].error,
    partial:r.slice(0,8).some(x=>(x.data?.length??0)>=cap)});
  })().catch(()=>{if(live)setError("No fue posible consultar el ERP. Comprueba la conexión y los permisos.");})
   .finally(()=>{if(live)setLoading(false);});
  return()=>{live=false;};
 },[tenantId,tenant?.tenant_slug,reload]);
 const trend=useMemo(()=>{const rows=chartRows();if(!data)return rows;
  for(const [field,source] of [["quotes",data.quotes],["orders",data.orders],["deliveries",data.deliveries]] as const)
   for(const item of source??[]){const d=new Date(item.created_at);if(!Number.isFinite(d.getTime()))continue;const m=rows.find(x=>x.key===d.toISOString().slice(0,7));if(m)m[field]++;}
  return rows;
 },[data]);
 const noActivity=data!==null&&[data.quotes,data.orders,data.jobs,data.deliveries,data.payments].every(x=>Array.isArray(x)&&x.length===0);
 const unverified=data?.products?.filter(x=>x.status!=="active"||x.metadata?.verification_status!=="approved"||Number(x.sale_price)<=0);
 const lowStock=data?.inventory?.filter(x=>x.active&&Number(x.on_hand)-Number(x.reserved)<=Number(x.reorder_level));
 const steps=[
  {title:"Cotización",desc:"Cliente, ficha y precio verificado",link:"/crm/quotations",icon:FileText,number:count(data?.quotes)},
  {title:"Pedido",desc:"Aceptación y orden comercial",link:"/crm/operations",icon:ShoppingCart,number:count(data?.orders)},
  {title:"Equipos",desc:"Existencias y materiales",link:"/crm/inventory",icon:Boxes,number:count(data?.inventory)},
  {title:"Instalación",desc:"Trabajo, visita y entrega",link:"/crm/operations",icon:Wrench,number:count(data?.jobs)},
  {title:"Cobro",desc:"Pagos anotados y pendientes",link:"/crm/finanzas",icon:Wallet,number:count(data?.payments)}
 ];
 if(tenant?.tenant_slug!=="family-power")return <div role="alert">El ERP de Family Power requiere seleccionar su empresa autorizada.</div>;
 return <main className={styles.page}>
  <header className={styles.hero}>
   <div><span className={styles.eyebrow}>Family Power · ERP operativo</span><h1>Centro de operaciones</h1>
    <p>Una vista para organizar la venta de inversores, el inventario, la instalación y el cobro. Los datos corresponden exclusivamente a esta empresa.</p>
    <div className={styles.actions}><Link href="/crm/quotations"><FileText size={16}/> Cotizaciones <ArrowRight size={15}/></Link><Link href="/crm/operations"><ClipboardCheck size={16}/> Pedidos y trabajos</Link></div>
   </div><button type="button" disabled={loading} onClick={()=>setReload(x=>x+1)}><RefreshCw size={16}/> Actualizar</button>
  </header>
  {error&&<p className={styles.warning} role="alert"><ShieldAlert size={17}/>{error}</p>}
  {data?.partial&&<p className={styles.warning} role="status">Hay más de {cap-1} registros en algún origen. Los recuentos son parciales.</p>}
  <section className={styles.metrics} aria-label="Estado operacional">
   {[
    {name:"Cotizaciones",n:count(data?.quotes),icon:FileText,link:"/crm/quotations"},
    {name:"Pedidos",n:count(data?.orders),icon:ShoppingCart,link:"/crm/operations"},
    {name:"Trabajos",n:count(data?.jobs),icon:Wrench,link:"/crm/operations"},
    {name:"Entregas",n:count(data?.deliveries),icon:Truck,link:"/crm/operations"}
   ].map(({name,n,icon:Icon,link})=><Link key={name} href={link} className={styles.metric}><span><Icon size={18}/>{name}</span><strong>{loading?"…":n}</strong><small>Consultar <ArrowRight size={13}/></small></Link>)}
  </section>
  <section className={styles.panel}><div className={styles.heading}><div><span className={styles.eyebrow}>Proceso de trabajo</span><h2>De la propuesta a la instalación</h2></div><span className={styles.source}><Activity size={14}/> Registros del CRM</span></div>
   <div className={styles.steps}>{steps.map(({title,desc,link,icon:Icon,number},i)=><Link href={link} key={title} className={styles.step}><div><span>{i+1}</span><Icon size={20}/><strong>{loading?"…":number}</strong></div><h3>{title}</h3><p>{desc}</p><small>Abrir <ArrowRight size={13}/></small></Link>)}</div>
  </section>
  {noActivity?<section className={styles.empty}>
   <div><span className={styles.eyebrow}>Siguiente acción</span><h2>Comienza con una operación real</h2><p>Family Power aún no ha registrado cotizaciones, pedidos, trabajos, entregas ni pagos. Primero verifica los inversores y registra una propuesta auténtica.</p></div>
   <div><Link href="/crm/products"><PackageCheck size={17}/> Revisar {unverified?.length??"—"} productos <ArrowRight size={14}/></Link><Link href="/crm/quotations"><FileText size={17}/> Abrir cotizaciones <ArrowRight size={14}/></Link></div>
  </section>:<section className={styles.panel}><div className={styles.heading}><div><span className={styles.eyebrow}>Operaciones verificadas</span><h2>Actividad de seis meses</h2></div></div>
   {trend.some(x=>x.quotes+x.orders+x.deliveries>0)?<div className={styles.chart}><ResponsiveContainer width="100%" height="100%"><BarChart data={trend}><CartesianGrid vertical={false} stroke="#e8ecee"/><XAxis dataKey="month" tickLine={false} axisLine={false}/><YAxis allowDecimals={false} width={32}/><Tooltip/><Bar dataKey="quotes" name="Cotizaciones" fill="#ac304c" radius={[4,4,0,0]}/><Bar dataKey="orders" name="Pedidos" fill="#1c8796" radius={[4,4,0,0]}/><Bar dataKey="deliveries" name="Entregas" fill="#c5a065" radius={[4,4,0,0]}/></BarChart></ResponsiveContainer></div>:<p>No hay actividad reciente suficiente para graficar.</p>}
  </section>}
  <section className={styles.readiness}><div className={styles.heading}><div><span className={styles.eyebrow}>Preparación operativa</span><h2>Qué está pendiente antes de usarlo al 100 %</h2></div></div>
   <div className={styles.grid}>
    <article><PackageCheck size={20}/><strong>Catálogo</strong><span>{loading?"Consultando":unverified===undefined?"No disponible":unverified.length+" fichas pendientes"}</span><p>Confirmar precios y especificaciones de los inversores antes de cotizar.</p><Link href="/crm/products">Ver productos <ArrowRight size={14}/></Link></article>
    <article><Boxes size={20}/><strong>Almacenes e inventario</strong><span>{loading?"Consultando":!data?.warehouses?"Estructura pendiente":count(data.inventory)+" artículos"}</span><p>{data&&!data.warehouses?"Las tablas de almacenes o ubicaciones del inventario nativo no están disponibles en la base actual.":"El inventario se controla con cantidades reales; alerta de reposición: "+(lowStock?.length??"—")}</p><Link href="/crm/inventory">Ver inventario <ArrowRight size={14}/></Link></article>
    <article><CalendarCheck size={20}/><strong>Tareas operativas</strong><span>{loading?"Consultando":count(data?.tasks)}</span><p>Seguimiento de las gestiones del equipo y trabajos pendientes.</p><Link href="/crm/tasks">Abrir tareas <ArrowRight size={14}/></Link></article>
    <article><ShieldAlert size={20}/><strong>Contabilidad y DGII</strong><span>Integración pendiente</span><p>Los movimientos de caja no sustituyen los libros, la conciliación bancaria ni los comprobantes e-CF.</p><Link href="/crm/finanzas">Ver finanzas <ArrowRight size={14}/></Link></article>
   </div>
  </section>
  <footer className={styles.note}><CheckCircle2 size={18}/> Este panel no genera ventas, pagos, existencias ni facturas ficticias. Los módulos y los permisos existentes se conservan.</footer>
 </main>;
}
