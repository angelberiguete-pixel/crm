"use client";
import Link from "next/link";
import {useEffect,useState} from "react";
import {ArrowRight,Database,LockKeyhole,RefreshCw,ShieldAlert,ShieldCheck} from "lucide-react";
import {supabase} from "@/lib/supabase";
import {useActiveTenant} from "@/components/tenant-context";
import styles from "./erp-dual-engine-status.module.css";

type Connection={provider:"odoo"|"dolibarr";status:string;sync_direction:string|null;last_healthcheck_at:string|null;recently_verified:boolean};
type Policy={domain:string;canonical_system:string;sync_mode:string};
const providers=[{id:"odoo",label:"Odoo Community 20",role:"Planificación, compras y procesos ERP complementarios"},{id:"dolibarr",label:"Dolibarr 24",role:"Administración, documentación y funciones complementarias"}] as const;
const domains=["Inventario","Pedidos","Contabilidad","Pagos","Facturas"] as const;
export default function ErpDualEngineStatus(){
 const tenant=useActiveTenant();
 const tenantId=tenant?.tenant_id??null;
 const allowed=tenant?.tenant_slug==="eurevector"&&["owner","admin"].includes(tenant.membership_role);
 const [connections,setConnections]=useState<Connection[]>([]);
 const [policies,setPolicies]=useState<Policy[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const [schemaReady,setSchemaReady]=useState(false);
 const [revision,setRevision]=useState(0);
 useEffect(()=>{
  let alive=true;setLoading(true);setConnections([]);setPolicies([]);setError("");setSchemaReady(false);
  if(!allowed||!tenantId){setLoading(false);return()=>{alive=false;};}
  void Promise.all([
   supabase.from("erp_dual_connection_status")
    .select("provider,status,sync_direction,last_healthcheck_at,recently_verified").eq("tenant_id",tenantId),
   supabase.from("erp_dual_domain_policy")
    .select("domain,canonical_system,sync_mode").eq("tenant_id",tenantId)
  ]).then(([conn,domains])=>{
   if(!alive)return;
   if(conn.error||domains.error){
    setError("El centro de integración aún no está activado en esta base o no tienes autorización para consultarlo.");
    return;
   }
   setSchemaReady(true);
   setConnections((conn.data??[]) as Connection[]);
   setPolicies((domains.data??[]) as Policy[]);
  }).catch(()=>{if(alive)setError("No se pudo comprobar el estado de los motores ERP.");})
  .finally(()=>{if(alive)setLoading(false);});
  return()=>{alive=false;};
 },[allowed,tenantId,revision]);
 if(!allowed)return null;
 const cFor=(name:string)=>connections.find(c=>c.provider===name);
 return <section className={styles.root} aria-label="Integración de Odoo y Dolibarr en Empresia">
  <header className={styles.heading}>
   <div><span className={styles.eyebrow}>Empresia · Arquitectura de integración</span><h2>Odoo + Dolibarr · Control unificado</h2><p>Empresia conserva la autoridad sobre los registros comerciales. Las dos herramientas externas se conectan como servicios complementarios, sin escritura duplicada.</p></div>
   <button type="button" onClick={()=>setRevision(v=>v+1)} disabled={loading}><RefreshCw size={16}/> Comprobar</button>
  </header>
  {error&&<p className={styles.warning} role="alert"><ShieldAlert size={16}/>{error}</p>}
  <div className={styles.providers}>
   {providers.map(p=>{
    const c=cFor(p.id);
    const ready=schemaReady&&c?.status==="connected"&&c.recently_verified===true;
    return <article key={p.id}>
     <div className={styles.providerHeading}><Database size={23}/><div><strong>{p.label}</strong><small>{p.role}</small></div></div>
     <div className={styles.status}><span className={ready?styles.good:styles.off}>{loading?"Verificando":ready?"Conexión verificada":c?"Conexión no verificada":"Sin conexión registrada"}</span></div>
     <p>{ready?"Salud de la conexión comprobada en las últimas 24 horas.":c?"La configuración existe, pero no hay una verificación vigente de disponibilidad y credenciales.":"El motor no está configurado aún para Empresia; el código clonado no constituye un servicio en ejecución."}</p>
     <small>Modo de sincronización: {c?.sync_direction??"desactivado"}</small>
    </article>;
   })}
  </div>
  <div className={styles.authority}>
    <div className={styles.authorityHead}><ShieldCheck size={22}/><div><h3>Una sola fuente de verdad</h3><p>Las escrituras de inventario, pedidos, cobros y asientos se bloquean en conectores externos hasta aprobar su flujo transaccional.</p></div></div>
    <div className={styles.domains}>
      {domains.map(label=>{
        const key=label==="Inventario"?"inventory":label==="Pedidos"?"orders":label==="Contabilidad"?"accounting":label==="Pagos"?"payments":"invoices";
        const cfg=policies.find(p=>p.domain===key);
        return <div key={key}><span>{label}</span><strong><LockKeyhole size={13}/> {cfg?.canonical_system==="empresia"?"Empresia":"Sin activar"}</strong><small>{cfg?.sync_mode==="mirror"?"Espejo autorizado":cfg?.sync_mode==="observe"?"Observación": "Sin sincronización"}</small></div>;
      })}
    </div>
  </div>
  <p className={styles.footnote}><ShieldAlert size={16}/> Esta pantalla muestra conexiones y permisos verificados, no simula servidores, facturas ni balances. El libro contable completo aún necesita su activación y revisión independiente.</p>
  <Link className={styles.link} href="/crm/integrations">Administrar conexiones ERP <ArrowRight size={16}/></Link>
 </section>;
}
