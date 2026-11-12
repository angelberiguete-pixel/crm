"use client";
import Link from "next/link";
import {useEffect,useMemo,useState} from "react";
import {Activity,ArrowRight,CheckCircle2,CircuitBoard,CloudOff,Flame,LockKeyhole,RadioTower,RefreshCw,ShieldAlert,ShieldCheck,Unplug,WifiOff,Wrench} from "lucide-react";
import {ResponsiveContainer,BarChart,Bar,XAxis,YAxis,Tooltip} from "recharts";
import {supabase} from "@/lib/supabase";
import {useActiveTenant} from "@/components/tenant-context";
import styles from "./family-power-installation-safety.module.css";

type Work={id:string;status:string;created_at:string;order_id?:string|null;delivered_at?:string|null};
const states:{label:string;description:string;icon:typeof ShieldCheck}[]=[
 {label:"Identificación del equipo",description:"Marca, modelo, manual técnico y ubicación del inversor y del detector.",icon:CircuitBoard},
 {label:"Validación de comunicación",description:"Comprobar con fabricante si existe API, relé seco, Modbus, MQTT o pasarela certificada; no asumir compatibilidad.",icon:RadioTower},
 {label:"Sistema de incendio independiente",description:"Detectores y alarmas adecuados al inmueble y al reglamento local; no depender del CRM para alarmar.",icon:Flame},
 {label:"Monitoreo y alertas",description:"Solo después de pruebas de instalación, supervisión de conexión, eventos verificados y responsables definidos.",icon:ShieldCheck},
];
export default function FamilyPowerInstallationSafety(){
 const tenant=useActiveTenant();const id=tenant?.tenant_id;
 const allowed=tenant?.tenant_slug==="family-power"&&["owner","admin"].includes(tenant.membership_role);
 const [orders,setOrders]=useState<Work[]>([]),[deliveries,setDeliveries]=useState<Work[]>([]);
 const [loading,setLoading]=useState(true),[error,setError]=useState(""),[revision,setRevision]=useState(0);
 useEffect(()=>{
  let live=true;setOrders([]);setDeliveries([]);setLoading(true);setError("");
  if(!id||!allowed){setLoading(false);return()=>{live=false;};}
  void Promise.all([
   supabase.from("orders").select("id,status,created_at").eq("tenant_id",id).order("created_at",{ascending:false}).limit(1000),
   supabase.from("deliveries").select("id,order_id,status,delivered_at,created_at").eq("tenant_id",id).order("created_at",{ascending:false}).limit(1000)
  ]).then(([o,d])=>{if(!live)return;if(o.error||d.error){setError("No se pudo comprobar el estado de los trabajos. Las métricas no están disponibles.");return;}setOrders((o.data??[]) as Work[]);setDeliveries((d.data??[]) as Work[]);})
   .catch(()=>{if(live)setError("No se pudieron consultar las instalaciones.");}).finally(()=>{if(live)setLoading(false);});
  return()=>{live=false;};
 },[id,allowed,revision]);
 const chart=useMemo(()=>{const m=new Map<string,number>();for(const d of deliveries)m.set(d.status,(m.get(d.status)??0)+1);return [...m].map(([name,count])=>({name:name.replaceAll("_"," "),count}));},[deliveries]);
 if(!allowed)return <div role="alert" className="notice">La seguridad técnica de instalaciones es accesible únicamente para responsables autorizados de Family Power.</div>;
 return <main className={styles.page}>
  <header className={styles.hero}><div><span className={styles.eyebrow}>Family Power · Ingeniería y prevención</span><h1><ShieldCheck size={30}/> Seguridad de instalaciones</h1><p>Control de trabajos, protección de los equipos y preparación para futuros detectores de humo y alarmas conectadas.</p></div><div className={styles.heroBadge}><Flame size={24}/><span>Sin telemetría conectada</span></div></header>
  <section className={styles.status}>
   <article><span><WifiOff size={18}/> Detectores conectados</span><strong>Sin fuente</strong><small>El sistema no recibe datos de sensores.</small></article>
   <article><span><Wrench size={18}/> Pedidos registrados</span><strong>{loading?"…":error?"—":orders.length}</strong><small>Operaciones del CRM</small></article>
   <article><span><CheckCircle2 size={18}/> Entregas registradas</span><strong>{loading?"…":error?"—":deliveries.length}</strong><small>No equivalen a instalaciones certificadas.</small></article>
   <article><span><LockKeyhole size={18}/> Acceso técnico</span><strong>Restringido</strong><small>Solo propietarios y administradores</small></article>
  </section>
  <div className={styles.columns}>
   <section className={styles.panel}><div className={styles.panelHead}><div><h2>Seguimiento de instalaciones</h2><p>Estados registrados en el ERP, sin inventar lecturas de sensores.</p></div><button type="button" onClick={()=>setRevision(v=>v+1)} disabled={loading}><RefreshCw size={17}/> Recargar</button></div>
    {error&&<p role="alert" className={styles.error}>{error}</p>}
    {loading?<p role="status">Consultando trabajos…</p>:chart.length?<div className={styles.chart}><ResponsiveContainer width="100%" height="100%"><BarChart data={chart} layout="vertical" margin={{top:6,right:16,left:0,bottom:0}}><XAxis type="number" allowDecimals={false}/><YAxis type="category" dataKey="name" tick={{fontSize:11}} width={95}/><Tooltip/><Bar dataKey="count" name="Entregas" fill="#aa3449" radius={[0,5,5,0]}/></BarChart></ResponsiveContainer></div>:<div className={styles.empty}><Activity size={30}/><strong>Sin entregas registradas</strong><span>El gráfico se activará con las primeras entregas reales.</span></div>}
    <Link className={styles.link} href="/crm/operations">Abrir pedidos y servicios <ArrowRight size={16}/></Link>
   </section>
   <section className={styles.panel}><div className={styles.panelHead}><div><h2>Integración de detectores</h2><p>Requisitos técnicos antes de conectar equipos.</p></div><RadioTower size={23}/></div>
    <div className={styles.device}><div className={styles.deviceIcon}><Unplug size={27}/></div><div><strong>Conexión no configurada</strong><span>No hay fabricante, modelo, protocolo ni estación de monitoreo verificados.</span></div></div>
    <ol className={styles.steps}>{states.map(({label,description,icon:Icon},i)=><li key={label}><span className={styles.stepNum}>{i+1}</span><Icon size={20}/><div><strong>{label}</strong><p>{description}</p></div></li>)}</ol>
   </section>
  </div>
  <section className={styles.alert}><ShieldAlert size={23}/><div><strong>Protección contra incendios: prioridad de seguridad física</strong><p>Este módulo NO detecta humo ni incendios y NO reemplaza un detector certificado, una central de alarma, sirenas, evacuación o supervisión profesional. Una futura integración será únicamente complementaria; si el CRM o Internet falla, la protección local deberá seguir funcionando. Debe evaluarse con el instalador especializado y la normativa R-032 de República Dominicana.</p></div></section>
  <section className={styles.next}><div><span>Próxima definición con Family Power</span><h2>Necesitamos identificar el equipo exacto</h2><p>Solicitar al doctor: marca y modelo del inversor, foto y ficha del detector, forma de comunicación, existencia de central, necesidades de alertas y responsable de emergencias. No conectaremos hardware sin probar compatibilidad y seguridad.</p></div><Link href="/crm/settings" className={styles.link}>Ver usuarios y permisos <ArrowRight size={16}/></Link></section>
 </main>;
}
