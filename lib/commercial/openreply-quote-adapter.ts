/** Read-only compatibility with the deployed CRM quotation schema. */
export type CrmQuote = {id:string;tenant_id:string;contact_id:string|null;status:string;metadata?:Record<string,unknown>|null};
export function reviewOpenReplyDraft(q:CrmQuote,tenantId:string){
 if(!q?.id||!tenantId)return {ok:false,reason:"invalid_quote"} as const;
 if(q.tenant_id!==tenantId)return {ok:false,reason:"wrong_tenant"} as const;
 if(q.status!=="draft")return {ok:false,reason:"not_draft"} as const;
 if(!q.contact_id)return {ok:false,reason:"missing_contact"} as const;
 if(q.metadata?.origin!=="openreply"||q.metadata?.requires_human_review!==true)return {ok:false,reason:"not_verified_draft"} as const;
 return {ok:true,quotationId:q.id,tenantId:q.tenant_id,contactId:q.contact_id,requiresHumanReview:true} as const;
}
/** Meta delivery and inbound events are never evidence of customer approval. */
export const providerEventApprovesQuote=()=>false as const;
