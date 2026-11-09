/** Commercial quote lifecycle domain. No database access or implicit tenant authority. */
export type QuoteStatus = "draft" | "sent" | "approved" | "rejected" | "expired" | "converted";
export type QuoteAction = "send" | "approve" | "reject" | "expire" | "convert";
export type QuoteRole = "owner" | "admin" | "sales" | "customer";
export type Quote = {id:string;tenantId:string;customerId:string;status:QuoteStatus;totalMinor:number;currency:string;expiresAt:string;revision:number};
export type QuoteActor = {userId:string;tenantId:string;role:QuoteRole;active:boolean;customerId?:string};
export type QuoteTransition = {quote:Quote;actor:QuoteActor;action:QuoteAction;now:string;expectedRevision:number};
export type QuoteDecision = {ok:true;next:Quote}|{ok:false;reason:string};
const allowed: Record<QuoteAction,readonly QuoteStatus[]> = {send:["draft"],approve:["sent"],reject:["sent"],expire:["sent"],convert:["approved"]};
export function decideQuoteTransition({quote,actor,action,now,expectedRevision}:QuoteTransition):QuoteDecision {
 if (!actor.active || !actor.userId || !quote.id || !quote.tenantId || actor.tenantId!==quote.tenantId) return {ok:false,reason:"unauthorized"};
 if (!Number.isSafeInteger(expectedRevision) || expectedRevision!==quote.revision) return {ok:false,reason:"stale_revision"};
 if (!allowed[action]?.includes(quote.status)) return {ok:false,reason:"invalid_transition"};
 if (!Number.isSafeInteger(quote.totalMinor) || quote.totalMinor<0 || !quote.currency || !quote.customerId) return {ok:false,reason:"invalid_quote"};
 const current=Date.parse(now), expiry=Date.parse(quote.expiresAt);
 if (!Number.isFinite(current)||!Number.isFinite(expiry)) return {ok:false,reason:"invalid_date"};
 if (action==="expire" && current<expiry) return {ok:false,reason:"not_expired"};
 if (["send","approve","convert"].includes(action) && current>=expiry) return {ok:false,reason:"expired"};
 const isStaff=["owner","admin","sales"].includes(actor.role);
 const isCustomer=actor.role==="customer" && actor.customerId===quote.customerId;
 if ((["send","expire","convert"].includes(action) && !isStaff) || (["approve","reject"].includes(action) && !isCustomer)) return {ok:false,reason:"forbidden"};
 const nextStatus:Record<QuoteAction,QuoteStatus>={send:"sent",approve:"approved",reject:"rejected",expire:"expired",convert:"converted"};
 return {ok:true,next:{...quote,status:nextStatus[action],revision:quote.revision+1}};
}
/** Caller MUST verify actor, tenant membership, customer identity and quote ownership server-side and commit with atomic revision CAS. */
