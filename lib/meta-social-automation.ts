import type {MetaInboundEvent} from "./meta-webhook";

/**
 * Server-side eligibility policy for a future Meta social agent.
 * Returns a recommendation ONLY. It does not call Meta, OpenAI or Supabase.
 * The caller must authenticate the callback and resolve its account ID
 * to an authorized tenant-owned connection BEFORE invoking this function.
 */
export type MetaSocialDecision={
  status:"ignore"|"human_review"|"draft_candidate";
  reason:string;
  sourceEventKey:string;
  // A public comment never creates a DM messaging window.
  source:"dm"|"comment"|"other";
};
export type MetaSocialPolicy={
  verifiedAccountId:string;
  verifiedProvider:"instagram"|"messenger";
  enabled:boolean;
  alreadyProcessed:boolean;
  privateReplyAlreadyUsed?:boolean;
  nowMs:number;
  approvedKeywords:readonly string[];
  sensitiveTerms?:readonly string[];
};
const DAY=86_400_000;
const normalized=(s:string)=>s.normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("es").trim();
const timestampMs=(n:number|null):number|null=>{
  if(n===null||!Number.isFinite(n)||n<=0)return null;
  // Instagram messaging timestamps are generally milliseconds; Meta
  // comment timestamps can be seconds. Never infer a missing timestamp.
  return n<1e11?n*1000:n;
};
const result=(event:MetaInboundEvent,status:MetaSocialDecision["status"],reason:string):MetaSocialDecision=>({
  status,reason,sourceEventKey:event.idempotencyKey,
  source:event.kind==="comment"?"comment":event.kind==="message"?"dm":"other",
});

export function evaluateMetaSocialAutomation(
  event:MetaInboundEvent,policy:MetaSocialPolicy
):MetaSocialDecision {
  if(!["instagram","messenger"].includes(event.provider)||
     !["message","comment"].includes(event.kind))
    return result(event,"ignore","not_social_inbound");
  if(event.provider!==policy.verifiedProvider||
     event.accountId!==policy.verifiedAccountId||
     !policy.verifiedAccountId.trim())
    return result(event,"ignore","unverified_account_route");
  if(!policy.enabled)return result(event,"ignore","automation_disabled");
  if(policy.alreadyProcessed)return result(event,"ignore","already_processed");
  if(!event.participantId||!event.text?.trim())
    return result(event,"human_review","missing_author_or_text");
  const eventTime=timestampMs(event.timestamp);
  if(eventTime===null||!Number.isFinite(policy.nowMs)||
     eventTime>policy.nowMs+5*60*1000)
    return result(event,"human_review","unverified_event_time");
  const elapsed=policy.nowMs-eventTime;
  if(event.kind==="comment"){
    if(event.details.surface==="live")
      return result(event,"human_review","live_requires_active_broadcast");
    if(policy.privateReplyAlreadyUsed)
      return result(event,"ignore","single_private_reply_used");
    if(elapsed>7*DAY)return result(event,"ignore","comment_reply_window_closed");
  }else if(elapsed>DAY)
    return result(event,"human_review","dm_24h_window_closed");
  const message=normalized(event.text);
  if(!policy.approvedKeywords.some(k=>k.trim()&&message.includes(normalized(k))))
    return result(event,"ignore","no_approved_keyword");
  const sensitive=policy.sensitiveTerms??["garantia","descuento","factura","reembolso","pago","precio exacto"];
  if(sensitive.some(k=>k.trim()&&message.includes(normalized(k))))
    return result(event,"human_review","sensitive_business_claim");
  // "draft_candidate" is NOT authorization to send anything.
  return result(event,"draft_candidate","human_approval_required");
}
