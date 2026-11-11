/**
 * Browser-only deterministic training engine.
 * It never touches Supabase, OpenAI, Meta, real contacts, ERP, or payments.
 * Every result is explicitly simulated and ephemeral.
 */
export type LabRole="owner"|"admin"|"seller";
export type LabEventType="message.inbound"|"contact.created"|"opportunity.changed"|"quotation.created"|"order.changed"|"delivery.changed"|"payment.created";
export type LabRisk="low"|"controlled"|"supervised"|"restricted";
export type LabStatus="proposed"|"approved"|"rejected"|"executed"|"observed";
export type LabAction="review_inbound"|"qualify_contact"|"review_opportunity"|"review_quotation"|"coordinate_order"|"followup_delivery"|"verify_payment";
export type LabDecision={
 id:number;event:LabEventType;action:LabAction;risk:LabRisk;status:LabStatus;
 reason:string;priceVerified:boolean;taskId:number|null;outcome:"task_completed"|null;
};
export type LabState={nextId:number;tenant:"empresia-lab";decisions:LabDecision[];log:string[]};
export type LabCommand=
 | {type:"observe";event:LabEventType;priceVerified?:boolean}
 | {type:"review";id:number;actor:LabRole;approve:boolean}
 | {type:"execute";id:number;actor:LabRole}
 | {type:"complete";id:number;actor:LabRole}
 | {type:"reset"};
export const initialLabState:LabState={nextId:1,tenant:"empresia-lab",decisions:[],log:[]};
const rules:Record<LabEventType,{action:LabAction;risk:LabRisk;reason:string}>={
 "message.inbound":{action:"review_inbound",risk:"controlled",reason:"Mensaje recibido → consultar catálogo y contexto"},
 "contact.created":{action:"qualify_contact",risk:"low",reason:"Nuevo contacto → revisar datos y asignación"},
 "opportunity.changed":{action:"review_opportunity",risk:"low",reason:"Cambio de etapa → recomendar seguimiento"},
 "quotation.created":{action:"review_quotation",risk:"supervised",reason:"Cotización → requiere revisión comercial"},
 "order.changed":{action:"coordinate_order",risk:"supervised",reason:"Pedido → coordinación con responsables"},
 "delivery.changed":{action:"followup_delivery",risk:"controlled",reason:"Entrega → seguimiento del servicio"},
 "payment.created":{action:"verify_payment",risk:"restricted",reason:"Pago → comprobar con proveedor antes de confirmar"},
};
const authorized=(r:LabRole)=>r==="owner"||r==="admin";
function append(s:LabState,msg:string):LabState{return {...s,log:[msg,...s.log].slice(0,12)};}
export function labReduce(state:LabState,cmd:LabCommand):LabState{
 if(cmd.type==="reset")return initialLabState;
 if(cmd.type==="observe"){
  const rule=rules[cmd.event];if(!rule)return append(state,"Evento no admitido.");
  const check=cmd.event==="message.inbound"&&cmd.priceVerified!==true;
  const d:LabDecision={id:state.nextId,event:cmd.event,action:rule.action,
   risk:rule.risk,status:"proposed",reason:check?"Precio del inversor 3.6 kW sin verificar. No inventar oferta.":rule.reason,
   priceVerified:cmd.priceVerified===true,taskId:null,outcome:null};
  return append({...state,nextId:state.nextId+1,decisions:[d,...state.decisions]},"Evento sintético #"+d.id+" → decisión pendiente.");
 }
 const d=state.decisions.find(x=>x.id===cmd.id);
 if(!d)return append(state,"Decisión inexistente.");
 if(!authorized(cmd.actor))return append(state,"Denegado: el rol vendedor no puede aprobar ni ejecutar.");
 if(cmd.type==="review"){
  if(d.status!=="proposed")return append(state,"Denegado: la decisión ya fue revisada.");
  const status:LabStatus=cmd.approve?"approved":"rejected";
  return append({...state,decisions:state.decisions.map(x=>x.id===d.id?{...x,status}:x)},"Decisión #"+d.id+" "+(cmd.approve?"aprobada":"rechazada")+".");
 }
 if(cmd.type==="execute"){
  if(d.status==="executed"||d.status==="observed")return append(state,"Idempotencia: la tarea #"+d.taskId+" ya existe.");
  if(d.status!=="approved")return append(state,"Denegado: no hay aprobación humana.");
  return append({...state,decisions:state.decisions.map(x=>x.id===d.id?{...x,status:"executed",taskId:d.id}:x)},
   "Se creó una tarea INTERNA ficticia #"+d.id+". Ningún mensaje, pago o factura fue emitido.");
 }
 if(cmd.type==="complete"){
  if(d.status!=="executed")return append(state,"Denegado: primero debe existir una tarea ejecutada.");
  return append({...state,decisions:state.decisions.map(x=>x.id===d.id?{...x,status:"observed",outcome:"task_completed"}:x)},
   "Tarea ficticia #"+d.id+" completada; resultado observado. No equivale a una venta.");
 }
 return state;
}
export function labStats(state:LabState){
 return {events:state.decisions.length,
  proposed:state.decisions.filter(x=>x.status==="proposed").length,
  tasks:state.decisions.filter(x=>["executed","observed"].includes(x.status)).length,
  observed:state.decisions.filter(x=>x.status==="observed").length};
}
