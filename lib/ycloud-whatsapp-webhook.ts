/* Normalize only documented YCloud v2 event envelopes.
 * Call this function only AFTER successful HMAC verification.
 * No fallback tenant supplied by the incoming event is trusted.
 */
type Dict=Record<string,unknown>;
export type InboundYCloud={
  kind:"text"|"interactive";wabaId:string;businessPhone:string;from:string;
  externalMessageId:string;contactName:string;body:string;replyId:string|null;
  ctwaClickId:string|null;
};
export type OutboundYCloudStatus={
  wabaId:string;businessPhone:string;externalMessageId:string;status:"sent"|"delivered"|"read"|"failed";
};
function asObj(v:unknown):Dict|null{
  return v!==null&&typeof v==="object"&&!Array.isArray(v)?v as Dict:null;
}
function asPhone(v:unknown):string|null{
  if(typeof v!=="string"||!/^\+?[1-9][0-9]{7,14}$/.test(v))return null;
  return v[0]==="+"?v:"+"+v;
}
function context(event:unknown,expected:string):Dict|null{
  const e=asObj(event);if(e?.apiVersion!=="v2"||e.type!==expected)return null;
  return e;
}
export function parseYCloudInboundText(raw:unknown):InboundYCloud|null{
  const evt=context(raw,"whatsapp.inbound_message.received");
  const m=asObj(evt?.whatsappInboundMessage);
  const waba=m?.wabaId,from=asPhone(m?.from),to=asPhone(m?.to);
  const id=typeof m?.wamid==="string"&&m.wamid.length>=3?m.wamid:m?.id;
  if(typeof waba!=="string"||!/^\d{6,30}$/.test(waba)||!from||!to||
    typeof id!=="string"||id.length<3||id.length>256)return null;
  let body:string|null=null,replyId:string|null=null,kind:"text"|"interactive"="text";
  if(m?.type==="text"){
    const v=asObj(m.text)?.body;
    if(typeof v==="string")body=v.trim();
  }else if(m?.type==="interactive"){
    const inter=asObj(m.interactive);
    const reply=asObj(inter?.button_reply);
    if(inter?.type!=="button_reply"||typeof reply?.id!=="string"||!/^q:[0-9a-f-]{36}:(approve_request|request_changes|talk_to_advisor)$/i.test(reply.id))return null;
    kind="interactive";replyId=reply.id;
    body=typeof reply.title==="string"?reply.title.trim().slice(0,80):"Opción seleccionada";
  }
  if(!body||body.length>1600)return null;
  const n=asObj(m?.customerProfile)?.name;
  const attribution=asObj(m?.referral)?.ctwa_clid;
  return {kind,wabaId:waba,businessPhone:to,from,externalMessageId:id,
    contactName:typeof n==="string"?n.trim().slice(0,120):"",body,replyId,
    ctwaClickId:typeof attribution==="string"&&/^[a-zA-Z0-9_-]{12,512}$/.test(attribution)?attribution:null};
}
export function parseYCloudOutboundStatus(raw:unknown):OutboundYCloudStatus|null{
  const evt=context(raw,"whatsapp.message.updated");
  const m=asObj(evt?.whatsappMessage);
  const businessPhone=asPhone(m?.from);
  const waba=m?.wabaId;
  const externalMessageId=typeof m?.id==="string"&&m.id.length>=3?m.id:m?.wamid;
  const status=m?.status;
  if(!businessPhone||typeof waba!=="string"||!/^\d{6,30}$/.test(waba)||
    typeof externalMessageId!=="string"||externalMessageId.length<3||externalMessageId.length>256||
    !["sent","delivered","read","failed"].includes(String(status)))return null;
  return {businessPhone,wabaId:waba,externalMessageId,status:status as OutboundYCloudStatus["status"]};
}
