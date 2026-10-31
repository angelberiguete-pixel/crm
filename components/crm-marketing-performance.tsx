"use client";
import Link from "next/link";
import {useEffect,useState,type FormEvent} from "react";
import {BarChart3,Clock3,MessageSquare,RefreshCw,ShieldCheck,MousePointerClick,FileCheck2} from "lucide-react";
import {supabase} from "@/lib/supabase";
import {useActiveTenant} from "@/components/tenant-context";
import {buildQuoteInteractiveMessage} from "@/lib/whatsapp-quote-buttons";
import styles from "./crm-marketing-performance.module.css";
type Meta={dataset_id:string;waba_id:string;status:string;export_enabled:boolean};
type Counts={
 inbound_messages_30d:number;active_conversations_30d:number;human_replies_30d:number;
 ai_replies_30d:number;quotes_sent_30d:number;quotes_accepted_30d:number;
 won_opportunities_30d:number;inquiries_without_quote_30d:number
};
type SLA={actor:string;user_id:string|null;samples:number;average_seconds:number;median_seconds:number;p90_seconds:number};
type Overview={tenant_id:string;period_days:number;calculated_at:string;counts:Counts;response_sla:SLA[];recorded_events:Record<string,number>;meta_configuration:Meta|null;meta_export_live:boolean};
type Quote={id:string;quote_number:string;status:string;currency:string;total:number};
const fmt=(v:number)=>new Intl.NumberFormat("es-DO").format(v);
const duration=(seconds:number)=>seconds<60?Math.round(seconds)+" seg":seconds<3600?(seconds/60).toFixed(1)+" min":(seconds/3600).toFixed(1)+" h";
const labels:Record<string,string>={
 message_received:"Mensajes recibidos",human_reply:"Respuestas humanas",
 ai_reply:"Respuestas IA",interactive_reply:"Opciones seleccionadas",
 quotation_sent:"Cotizaciones enviadas",quotation_accepted:"Cotizaciones aceptadas",
 quotation_rejected:"Cotizaciones rechazadas",opportunity_won:"Oportunidades marcadas ganadas"
};
export default function CrmMarketingPerformance(){
 const tenant=useActiveTenant(),id=tenant?.tenant_id??null;
 const allowed=["admin","owner"].includes(tenant?.membership_role??"");
 const [overview,setOverview]=useState<Overview|null>(null);
 const [quotes,setQuotes]=useState<Quote[]>([]);
 const [selectedQuote,setSelectedQuote]=useState("");
 const [datasetId,setDatasetId]=useState("");
 const [wabaId,setWabaId]=useState("");
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [revision,setRevision]=useState(0);
 useEffect(()=>{
   let alive=true;setOverview(null);setQuotes([]);setLoading(true);setError("");setNotice("");
   if(!id||!allowed){setLoading(false);return()=>{alive=false;};}
   void Promise.all([
     supabase.rpc("marketing_tenant_overview",{p_tenant_id:id}),
     supabase.from("quotations").select("id,quote_number,status,currency,total").eq("tenant_id",id)
       .order("created_at",{ascending:false}).limit(50)
   ]).then(([analytics,quotations])=>{
     if(!alive)return;
     if(analytics.error||quotations.error){setError("No fue posible verificar todos los datos: "+(analytics.error??quotations.error)?.message);return;}
     const value=analytics.data as Overview;
     if(!value||value.tenant_id!==id){setError("La respuesta no pertenece al negocio actual.");return;}
     setOverview(value);
     setDatasetId(value.meta_configuration?.dataset_id??"");
     setWabaId(value.meta_configuration?.waba_id??"");
     setQuotes((quotations.data??[]) as Quote[]);
   }).catch(()=>{if(alive)setError("Error al consultar el análisis comercial.");})
   .finally(()=>{if(alive)setLoading(false);});
   return()=>{alive=false;};
 },[id,allowed,revision]);
 async function save(event:FormEvent<HTMLFormElement>){
   event.preventDefault();if(!id||busy)return;
   setBusy(true);setNotice("");setError("");
   try{
     const {data,error:rpcError}=await supabase.rpc("marketing_meta_configure_ids",{
       p_tenant_id:id,p_dataset_id:datasetId.trim(),p_waba_id:wabaId.trim()
     });
     if(rpcError){setError(rpcError.message);return;}
     if(!data){setError("No se confirmó el guardado.");return;}
     setNotice("IDs guardados para esta empresa. Meta no está conectado: faltan credenciales, permisos, consentimiento y una prueba de atribución.");
     setRevision(v=>v+1);
   }catch{setError("No se pudo guardar la configuración.");}
   finally{setBusy(false);}
 }
 if(!allowed)return <main className={styles.page}><h1>Acceso restringido</h1><p>Este tablero solo está disponible para la administración del negocio.</p><Link href="/crm">Volver al CRM</Link></main>;
 const q=quotes.find(x=>x.id===selectedQuote);
 const preview=q?buildQuoteInteractiveMessage(q.id,q.quote_number,new Intl.NumberFormat("es-DO",{style:"currency",currency:q.currency||"DOP"}).format(Number(q.total||0))):null;
 const countItems:[string,number|undefined,string][]=[
   ["Mensajes recibidos",overview?.counts.inbound_messages_30d,"Total entrante registrado"],
   ["Conversaciones activas",overview?.counts.active_conversations_30d,"Con mensajes recibidos"],
   ["Sin cotización registrada",overview?.counts.inquiries_without_quote_30d,"No significa que no comprarán"],
   ["Cotizaciones enviadas",overview?.counts.quotes_sent_30d,"Estado del CRM"],
   ["Cotizaciones aceptadas",overview?.counts.quotes_accepted_30d,"No equivale a pago"],
   ["Oportunidades ganadas",overview?.counts.won_opportunities_30d,"Estado del pipeline, no cobros"],
   ["Respuestas de vendedores",overview?.counts.human_replies_30d,"Solo envíos confirmados"],
   ["Respuestas IA",overview?.counts.ai_replies_30d,"Solo envíos confirmados"]
 ];
 return <main className={styles.page}>
  <header className={styles.top}><div><div className={styles.kicker}><BarChart3 size={17}/> Marketing y conversión · {tenant?.tenant_name}</div><h1>Rendimiento de conversaciones</h1><p>Datos reales de los últimos 30 días, por empresa. Las oportunidades, aprobaciones y cobros son etapas diferentes.</p></div>
  <div className={styles.actions}><Link href="/crm">Volver al CRM</Link><button onClick={()=>setRevision(v=>v+1)}><RefreshCw size={15}/> Actualizar</button></div></header>
  {error&&<p className={styles.warning} role="alert">{error}</p>}
  {notice&&<p className={styles.notice} role="status">{notice}</p>}
  {loading?<p role="status">Consultando indicadores…</p>:overview&&<>
  <section className={styles.kpis} aria-label="Indicadores de marketing">{countItems.map(([name,value,explain])=><article className={styles.kpi} key={name}><span>{name}</span><strong>{value===undefined?"—":fmt(value)}</strong><small>{explain}</small></article>)}</section>
  <div className={styles.columns}>
   <section className={styles.block}><h2><Clock3 size={18}/> Tiempos de primera respuesta</h2>
    <p>Promedio, mediana y percentil 90 por persona y por IA. Solo respuestas enviadas, no borradores ni mensajes fallidos.</p>
    {overview.response_sla.length===0?<p className={styles.empty}>Todavía no hay respuestas enviadas que permitan calcular tiempos reales.</p>:<div className={styles.scroller}><table><thead><tr><th>Respondió</th><th>Muestra</th><th>Promedio</th><th>Mediana</th><th>P90</th></tr></thead><tbody>
     {overview.response_sla.map((r,i)=><tr key={r.actor+":"+r.user_id+":"+i}><th>{r.actor==="ai"?"IA":"Vendedor"} {r.user_id?r.user_id.slice(0,8):""}</th><td>{r.samples}</td><td>{duration(r.average_seconds)}</td><td>{duration(r.median_seconds)}</td><td>{duration(r.p90_seconds)}</td></tr>)}
    </tbody></table></div>}
   </section>
   <section className={styles.block}><h2><MessageSquare size={18}/> Registro de eventos</h2><p>Solo actividades que realmente se han guardado en el CRM desde la instrumentación.</p>
    {Object.keys(overview.recorded_events).length?Object.entries(overview.recorded_events).map(([key,value])=><div className={styles.eventRow} key={key}><span>{labels[key]||key}</span><strong>{fmt(value)}</strong></div>):<p className={styles.empty}>Aún no se han recibido eventos nuevos.</p>}
   </section>
  </div>
  </>}
  <section className={styles.block} id="meta"><h2><ShieldCheck size={19}/> Meta · Conversions API para WhatsApp</h2>
  <p>Registra el dataset de eventos y WABA del negocio. Guardar los ID no envía información a Meta. La activación necesita credenciales en servidor, autorización de marketing y eventos de atribución comprobados.</p>
  <form onSubmit={save} className={styles.form}>
   <label>ID del dataset de Meta (o píxel asociado) <input inputMode="numeric" pattern="[0-9]{10,20}" required value={datasetId} onChange={e=>setDatasetId(e.target.value)} placeholder="Solo números" autoComplete="off"/></label>
   <label>ID de cuenta WhatsApp Business (WABA) <input inputMode="numeric" pattern="[0-9]{10,20}" required value={wabaId} onChange={e=>setWabaId(e.target.value)} placeholder="Solo números" autoComplete="off"/></label>
   <button type="submit" disabled={busy||loading}>{busy?"Guardando…":"Guardar identificadores"}</button>
  </form>
  <p className={styles.status}>Estado: {overview?.meta_configuration?"Identificadores registrados; sin exportación":"Pendiente de configurar"}. Envío de eventos a Meta: <strong>desactivado</strong>.</p>
  <p>Configúralos en <Link href="https://business.facebook.com/events_manager2/">Administrador de eventos de Meta</Link>. No escribas tokens ni contraseñas en un mensaje o en este formulario.</p>
  </section>
  <section className={styles.block}><h2><MousePointerClick size={19}/> Botones de cotización por WhatsApp</h2>
   <p>Las tres opciones se han preparado para enviarse mediante YCloud cuando el canal esté verificado. Una pulsación registra una intención; no autoriza automáticamente un cobro ni sustituye un contrato.</p>
   <label className={styles.choose}>Cotización existente <select value={selectedQuote} onChange={e=>setSelectedQuote(e.target.value)}><option value="">Selecciona una cotización para previsualizar</option>
   {quotes.map(x=><option key={x.id} value={x.id}>{x.quote_number} · {x.status}</option>)}</select></label>
   {preview?<div className={styles.preview}><p>{preview.interactive.body.text}</p><div className={styles.buttons}>{preview.interactive.action.buttons.map(x=><span key={x.reply.id}>{x.reply.title}</span>)}</div><small>Vista de muestra: no se envió un WhatsApp.</small></div>:
   <p className={styles.empty}>No has seleccionado una cotización. Podrás crearla desde <Link href="/crm/quotations">Cotizaciones</Link>.</p>}
   <p className={styles.status}><FileCheck2 size={16}/> Pendiente: activar envío YCloud seguro, validar webhook de respuesta y vincular el clic a la cotización y al contacto correctos.</p>
  </section>
 </main>;
}
