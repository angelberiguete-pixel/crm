/** CRM persisted quote contract: contact_id, valid_until and metadata-based revision.
 * No approval is permitted without server-verified customer ownership.
 */
export type PersistedQuote={id:string;tenant_id:string;contact_id:string|null;status:string;valid_until:string|null;total:number|string;currency:string;metadata:Record<string,unknown>|null};
export type StaffActor={userId:string;tenantId:string;role:"owner"|"admin"|"sales"|"viewer";active:boolean};
export type SendDecision={ok:true;expectedRevision:number;nextRevision:number}|{ok:false;reason:string};
export function quoteRevision(q:PersistedQuote):number|null{
 const r=q.metadata?.commercial_revision??0;
 return Number.isSafeInteger(r)&&typeof r==="number"&&r>=0?r:null;
}
export function decideStaffSend(q:PersistedQuote,actor:StaffActor,expectedRevision:number,now:Date):SendDecision{
 if(!actor.active||!actor.userId||actor.tenantId!==q.tenant_id||!["owner","admin","sales"].includes(actor.role))return {ok:false,reason:"unauthorized"};
 if(q.status!=="draft")return {ok:false,reason:"invalid_transition"};
 if(!q.contact_id||!q.currency||!Number.isFinite(Number(q.total))||Number(q.total)<0)return {ok:false,reason:"invalid_quote"};
 if(!q.valid_until||!Number.isFinite(now.valueOf())||now.valueOf()>=Date.parse(q.valid_until+"T23:59:59.999Z"))return {ok:false,reason:"expired"};
 const revision=quoteRevision(q);
 if(revision===null||revision!==expectedRevision)return {ok:false,reason:"stale_revision"};
 if(q.metadata?.origin==="openreply"&&q.metadata?.requires_human_review!==true)return {ok:false,reason:"review_required"};
 return {ok:true,expectedRevision:revision,nextRevision:revision+1};
}
/** Provider events cannot assert verified customer consent. */
export function decideProviderApproval(){return {ok:false,reason:"verified_customer_authorization_required"} as const}
