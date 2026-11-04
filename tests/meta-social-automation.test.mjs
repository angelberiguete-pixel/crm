import {test} from "node:test";
import assert from "node:assert/strict";
import {evaluateMetaSocialAutomation} from "../lib/meta-social-automation.ts";

const now=Date.UTC(2026,10,3,18);
const event=(kind="message",overrides={})=>({
  provider:"instagram",kind,accountId:"verified-ig-business",externalId:"evt-1",
  idempotencyKey:"instagram:"+kind+":verified-ig-business:evt-1",
  participantId:"follower-123",timestamp:now-2*60*1000,text:"INFO por favor",
  details:kind==="comment"?{surface:"post",mediaId:"media-1"}:{},
  ...overrides
});
const policy=(overrides={})=>({
  verifiedAccountId:"verified-ig-business",verifiedProvider:"instagram",
  enabled:true,alreadyProcessed:false,nowMs:now,approvedKeywords:["INFO","CATALOGO"],
  ...overrides
});

test("only authorized tenant-routed social inbound events may reach the draft queue",()=>{
  assert.equal(evaluateMetaSocialAutomation(event(),policy()).status,"draft_candidate");
  assert.equal(evaluateMetaSocialAutomation(event(),policy({verifiedAccountId:"other-tenant"})).reason,"unverified_account_route");
  assert.equal(evaluateMetaSocialAutomation(event(),policy({enabled:false})).reason,"automation_disabled");
  assert.equal(evaluateMetaSocialAutomation(event(),policy({alreadyProcessed:true})).reason,"already_processed");
  assert.equal(evaluateMetaSocialAutomation(event("message",{provider:"whatsapp"}),policy()).reason,"not_social_inbound");
  assert.equal(evaluateMetaSocialAutomation(event("message_echo"),policy()).reason,"not_social_inbound");
});
test("comments are not consent to a DM conversation; only one permitted private reply window",()=>{
  assert.equal(evaluateMetaSocialAutomation(event("comment"),policy()).status,"draft_candidate");
  assert.equal(evaluateMetaSocialAutomation(event("comment"),policy({privateReplyAlreadyUsed:true})).reason,"single_private_reply_used");
  assert.equal(evaluateMetaSocialAutomation(event("comment",{timestamp:now-8*86400000}),policy()).reason,"comment_reply_window_closed");
  assert.equal(evaluateMetaSocialAutomation(event("comment",{timestamp:null}),policy()).reason,"unverified_event_time");
  assert.equal(evaluateMetaSocialAutomation(event("comment",{details:{surface:"live"}}),policy()).reason,"live_requires_active_broadcast");
});
test("messaging windows, missing identity, and sensitive business claims fail safe",()=>{
  assert.equal(evaluateMetaSocialAutomation(event("message",{timestamp:now-25*3600000}),policy()).reason,"dm_24h_window_closed");
  assert.equal(evaluateMetaSocialAutomation(event("message",{timestamp:now+7*60000}),policy()).reason,"unverified_event_time");
  assert.equal(evaluateMetaSocialAutomation(event("message",{participantId:null}),policy()).reason,"missing_author_or_text");
  assert.equal(evaluateMetaSocialAutomation(event("message",{text:"El costo de la garantía"}),policy({approvedKeywords:["garantía"]})).reason,"sensitive_business_claim");
  assert.equal(evaluateMetaSocialAutomation(event("message",{text:"ALGO NUEVO"}),policy()).reason,"no_approved_keyword");
});
test("Messenger remains another verified account: a Page comment can create a human-reviewed draft, never auto-send",()=>{
  const f=event("comment",{provider:"messenger",accountId:"fb-page-5",text:"CATÁLOGO",details:{surface:"page_post"},timestamp:Math.floor((now-60000)/1000)});
  const r=evaluateMetaSocialAutomation(f,policy({verifiedAccountId:"fb-page-5",verifiedProvider:"messenger"}));
  assert.deepEqual({status:r.status,source:r.source,reason:r.reason},
    {status:"draft_candidate",source:"comment",reason:"human_approval_required"});
  assert.equal("message" in r,false);
  assert.equal("send" in r,false);
});
