import {test} from "node:test";
import assert from "node:assert/strict";
import {classifyWhatsAppHandoff,checkWhatsAppAgentDraftReadiness} from "../lib/whatsapp-agent-handoff.ts";

test("client explicitly requests a human; the system never auto-sends",()=>{
 for(const body of ["Quiero hablar con un asesor","Necesito hablar con una persona real",
                    "Por favor, pásame con un vendedor","Quiero comunicarme con un humano"]){
  const result=classifyWhatsAppHandoff(body);
  assert.equal(result.intent,"human_requested",body);
  assert.equal(result.requiresHuman,true);
  assert.equal(result.mayAutoSend,false);
 }
});
test("a quote 'approval' in chat requires verification by a human",()=>{
 for(const body of ["Acepto la cotización","Confirmo el presupuesto","La propuesta fue aprobada"]){
  const res=classifyWhatsAppHandoff(body);
  assert.equal(res.intent,"quote_acknowledgment",body);
  assert.equal(res.nextStep,"verify_quote_approval");
  assert.equal(res.mayAutoSend,false);
 }
});
test("prices, bookings and sensitive disputes never become autonomous commitments",()=>{
 assert.equal(classifyWhatsAppHandoff("Cuánto cuesta instalar paneles").nextStep,"review_quote");
 assert.equal(classifyWhatsAppHandoff("Necesito una visita técnica").nextStep,"verify_calendar");
 assert.equal(classifyWhatsAppHandoff("Tengo una queja por un cobro").nextStep,"review_billing");
 assert.equal(classifyWhatsAppHandoff("Hola, me pueden explicar sus servicios").nextStep,"prepare_draft_only");
 assert.equal(classifyWhatsAppHandoff(null).mayAutoSend,false);
});
test("draft mode fails closed for missing provider, budget or route and never sends",()=>{
 const all={verifiedWhatsAppRoute:true,tenantMatchesConversation:true,optInToReview:true,
  agentIsDraftOrActive:true,completeVerifiedBusinessKnowledge:true,
  paidProviderAuthorized:true,budgetAuthorized:true,humanAssigned:false,explicitAgentReplyApproval:false};
 assert.deepEqual(checkWhatsAppAgentDraftReadiness(all),{canPrepareDraft:true,maySendAutomatically:false,missing:[]});
 for(const key of ["verifiedWhatsAppRoute","tenantMatchesConversation","paidProviderAuthorized","budgetAuthorized"]){
  const res=checkWhatsAppAgentDraftReadiness({...all,[key]:false});
  assert.equal(res.canPrepareDraft,false);
  assert.ok(res.missing.includes(key));
 }
 assert.equal(checkWhatsAppAgentDraftReadiness({...all,humanAssigned:true}).canPrepareDraft,false);
});
