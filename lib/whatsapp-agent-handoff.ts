/**
 * Reusable first-pass triage for verified WhatsApp conversations.
 *
 * This is a DETERMINISTIC SUGGESTION, not a generative AI call or a send action.
 * The caller must validate the tenant/number against a server-held verified route.
 * Do not trust user-provided "approved" text as evidence that a real quote was approved.
 */
export type WhatsAppHandoffIntent =
  | "human_requested" | "quote_acknowledgment" | "quote_requested"
  | "billing_or_complaint" | "appointment_requested" | "general_information";
export type WhatsAppHandoffDecision = {
  intent: WhatsAppHandoffIntent;
  requiresHuman: boolean;
  nextStep: "transfer_to_human" | "verify_quote_approval" |
    "review_quote" | "review_billing" | "verify_calendar" | "prepare_draft_only";
  mayAutoSend: false;
};
function foldText(value: unknown):string {
  if(typeof value!=="string")return "";
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLowerCase().replace(/\s+/g," ").trim().slice(0,1800);
}
const test=(v:string,p:RegExp)=>p.test(v);
export function classifyWhatsAppHandoff(body:unknown):WhatsAppHandoffDecision {
 const v=foldText(body);
 let intent:WhatsAppHandoffIntent="general_information";
 let nextStep:WhatsAppHandoffDecision["nextStep"]="prepare_draft_only";
 const human=test(v,/\b(humano|persona real|asesor(?:a)?|representante|operador|vendedor|supervisor)\b/)
    &&test(v,/\b(hablar|comunicar|contactar|atender|transfer|pasar|quiero|necesito|prefiero|llam|conectar)\w*\b/);
 if(human || test(v,/\b(quiero hablar con alguien|pasame con alguien|necesito hablar con alguien)\b/)){
   intent="human_requested";nextStep="transfer_to_human";
 } else if(test(v,/\b(acepto|apruebo|aprobada|confirmo|autorizo)\b.{0,55}\b(cotizacion|propuesta|presupuesto|precio|oferta)\b/)
    ||test(v,/\b(cotizacion|propuesta|presupuesto|oferta)\b.{0,55}\b(aceptada|aprobada)\b/)){
   intent="quote_acknowledgment";nextStep="verify_quote_approval";
 } else if(test(v,/\b(reclamo|queja|reembolso|devolucion|factura|cobro|pago indebido)\b/)){
   intent="billing_or_complaint";nextStep="review_billing";
 } else if(test(v,/\b(cotizar|cotizacion|presupuesto|cuanto cuesta|precio|costos?)\b/)){
   intent="quote_requested";nextStep="review_quote";
 } else if(test(v,/\b(agendar|agenda|cita|reservar|disponibilidad|visita tecnica)\b/)){
   intent="appointment_requested";nextStep="verify_calendar";
 }
 return {
   intent,
   requiresHuman:nextStep!=="prepare_draft_only",
   nextStep,
   mayAutoSend:false
 };
}
export type AgentDraftSafety = {
  verifiedWhatsAppRoute:boolean;
  tenantMatchesConversation:boolean;
  optInToReview:boolean;
  agentIsDraftOrActive:boolean;
  completeVerifiedBusinessKnowledge:boolean;
  paidProviderAuthorized:boolean;
  budgetAuthorized:boolean;
  humanAssigned:boolean;
  explicitAgentReplyApproval:boolean;
};
/** A draft is allowed to be *prepared* only with all verified gates. */
export function checkWhatsAppAgentDraftReadiness(value:Partial<AgentDraftSafety>){
  const missing:(keyof AgentDraftSafety)[]=[];
  for(const key of ["verifiedWhatsAppRoute","tenantMatchesConversation","optInToReview",
    "agentIsDraftOrActive","completeVerifiedBusinessKnowledge","paidProviderAuthorized",
    "budgetAuthorized"] as const){
    if(value[key]!==true)missing.push(key);
  }
  if(value.humanAssigned===true)missing.push("humanAssigned");
  // Approved drafts never imply permission to send or to bypass WhatsApp conversation windows.
  return {canPrepareDraft:missing.length===0,maySendAutomatically:false as const,missing};
}
