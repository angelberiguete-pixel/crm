"use client";

import Link from "next/link";
import {useState} from "react";
import {Bot,Sparkles,ShieldAlert} from "lucide-react";
import {supabase} from "@/lib/supabase";

type SafeEvidence={source_table?:unknown;source_id?:unknown;context?:unknown};
type Agent={id:string;status:string;model_provider:string;approval_mode:string;allowed_tools:unknown};
function isUuid(value:unknown):value is string{
 return typeof value==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
/** No raw message, contact details, images, or payment data leave this component. */
function safeIntent(message:string):string{
 const text=message.toLowerCase();
 if(/inversor|inverter/.test(text)){
  const power=/3[.,]6[ ]*(kw|kva)?/.test(text)?"3.6 kW":"potencia sin verificar";
  return "Consulta comercial sobre inversor ("+power+").";
 }
 if(/precio|costo|cotiz/.test(text))return "Consulta de precio o cotización. Producto y precio pendientes de verificación.";
 if(/garantía|garantia|soporte|problema|falla/.test(text))return "Consulta de garantía o soporte; no prometer cobertura ni solución sin evidencia.";
 if(/instala|entrega|env[ií]o/.test(text))return "Consulta operativa sobre instalación o entrega; no prometer fecha.";
 return "Consulta comercial sin clasificación fiable. Pedir datos adicionales de manera profesional.";
}
export default function CrmIntelligenceDraft({tenantId,evidence}:{tenantId:string;evidence:SafeEvidence}){
 const [consent,setConsent]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [draft,setDraft]=useState("");
 const [info,setInfo]=useState("");
 async function prepare(){
  if(busy||!consent||evidence.source_table!=="messages"||!isUuid(evidence.source_id))return;
  setBusy(true);setError("");setDraft("");setInfo("");
  try{
   // All reads use the current user's JWT and explicit tenant_id filters.
   const [message,agents]=await Promise.all([
    supabase.from("messages").select("id,direction,body")
     .eq("tenant_id",tenantId).eq("id",evidence.source_id).maybeSingle(),
    supabase.from("ai_agents").select("id,status,model_provider,approval_mode,allowed_tools")
     .eq("tenant_id",tenantId).eq("status","draft").eq("model_provider","openai")
     .eq("approval_mode","human_approval").limit(5)
   ]);
   if(message.error||!message.data||message.data.direction!=="inbound")throw new Error("Consulta original no verificable.");
   if(agents.error)throw new Error("No fue posible comprobar los agentes de esta empresa.");
   const agent=(agents.data??[] as Agent[]).find(a=>Array.isArray(a.allowed_tools)&&a.allowed_tools.length===0);
   if(!agent)throw new Error("No hay un agente de borradores seguro configurado. Abre Empleados digitales.");
   const readiness=await supabase.functions.invoke("ai-employee-readiness",{
    body:{tenant_id:tenantId,agent_id:agent.id}
   });
   if(readiness.error||readiness.data?.ready_for_trial!==true)
    throw new Error("El proveedor, conocimiento verificado o presupuesto IA aún no están listos. Abre Empleados digitales.");

   const intent=safeIntent(String(message.data.body??""));
   // Product facts are optional; only approved/verified price metadata is supplied.
   let context=intent+" Si no hay precio comprobado, no dar precio, stock, fecha ni garantía.";
   if(intent.includes("3.6 kW")){
     const products=await supabase.from("products")
       .select("id,name,sku,status,sale_price,currency,metadata")
       .eq("tenant_id",tenantId).eq("status","active")
       .or("name.ilike.%3.6%,sku.ilike.%3.6%").limit(6);
     if(products.error)throw new Error("No se pudo verificar el catálogo.");
     const candidates=(products.data??[]).filter(p=>
       p.metadata&&typeof p.metadata==="object"&&p.metadata.price_verified===true&&
       Number.isFinite(Number(p.sale_price))&&Number(p.sale_price)>0);
     if(candidates.length===1){
       const p=candidates[0];
       context+=" Producto verificado en catálogo: "+String(p.name).slice(0,120)+
         ", precio publicado "+Number(p.sale_price)+" "+String(p.currency||"DOP")+
         ". Preparar respuesta para revisión, sin inventar disponibilidad.";
     }else context+=" La información del catálogo, especialmente el precio, no está verificada.";
   }
   const response=await supabase.functions.invoke("ai-employee-draft",{
     body:{tenant_id:tenantId,agent_id:agent.id,request_id:crypto.randomUUID(),question:
      "Redacta un borrador breve, amable y claro de atención comercial, sin afirmar que fue enviado. "+
      "No inventes cotización, precio, stock, descuentos, plazos, aprobaciones o facturación. "+context}
   });
   if(response.error||response.data?.ok!==true||typeof response.data?.draft!=="string")
     throw new Error("La generación no se completó o no quedó verificada.");
   setDraft(response.data.draft);
   setInfo("Borrador registrado en el historial del agente; requiere revisión humana. Coste estimado: US$"+
    (Number(response.data.estimated_cost_micros||0)/1e6).toFixed(4)+".");
  }catch(e){setError(e instanceof Error?e.message:"No se pudo preparar el borrador.");}
  finally{setBusy(false);}
 }
 return <section style={{display:"grid",gap:9,marginTop:12,padding:12,border:"1px solid #b6d5d9",borderRadius:10}}>
  <div style={{display:"flex",alignItems:"center",gap:8,fontSize:13,fontWeight:700}}><Bot size={17}/> Borrador asistido por OpenAI</div>
  <p style={{fontSize:12,lineHeight:1.5,margin:0}}>Se enviará al proveedor un resumen comercial minimizado, sin nombres, teléfonos ni el texto íntegro del mensaje. Nunca enviará una respuesta al cliente automáticamente.</p>
  <label style={{display:"flex",gap:8,fontSize:12,alignItems:"flex-start"}}>
    <input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>
    Confirmo que tengo autorización para utilizar el servicio de IA con esta consulta.
  </label>
  <div style={{display:"flex",gap:9,flexWrap:"wrap"}}>
    <button type="button" disabled={busy||!consent} onClick={()=>void prepare()} style={{display:"inline-flex",alignItems:"center",gap:7,padding:"9px 12px",borderRadius:8,background:"#14586b",color:"#fff",border:0,fontWeight:700,fontSize:12}}>
      <Sparkles size={16}/>{busy?"Generando…":"Preparar respuesta con IA"}
    </button>
    <Link href="/crm/employees" style={{fontSize:12,alignSelf:"center"}}>Configurar agentes y presupuesto</Link>
  </div>
  {error&&<p role="alert" style={{fontSize:12,color:"#a22929",display:"flex",alignItems:"center",gap:6}}><ShieldAlert size={15}/>{error}</p>}
  {draft&&<div role="status" style={{display:"grid",gap:8,fontSize:12,lineHeight:1.6}}>
    <strong>Solo borrador. No enviado.</strong>
    <p style={{whiteSpace:"pre-wrap",margin:0}}>{draft}</p>
    <small>{info}</small>
  </div>}
 </section>;
}
