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


/** Signed, inbound YCloud image or PDF metadata, NOT a public download URL.
 * Download links must never be written into message bodies, client metadata or logs.
 */
export type InboundYCloudMedia={
 kind:"image"|"document";wabaId:string;businessPhone:string;from:string;
 externalMessageId:string;contactName:string;providerMediaId:string;
 downloadUrl:string;mimeType:string;filename:string;caption:string;
 sha256:string|null;
};
export function parseYCloudInboundMedia(raw:unknown):InboundYCloudMedia|null{
 const evt=context(raw,"whatsapp.inbound_message.received");
 const m=asObj(evt?.whatsappInboundMessage);
 const kind=m?.type;
 if(kind!=="image"&&kind!=="document")return null;
 const file=asObj(m?.[kind]),waba=m?.wabaId,from=asPhone(m?.from),to=asPhone(m?.to);
 const id=typeof m?.wamid==="string"&&m.wamid.length>=3?m.wamid:m?.id;
 const mediaId=file?.id,mime=file?.mime_type,url=file?.link;
 if(typeof waba!=="string"||!/^\d{6,30}$/.test(waba)||!from||!to
  ||typeof id!=="string"||id.length<3||id.length>256
  ||typeof mediaId!=="string"||!/^[A-Za-z0-9_-]{5,128}$/.test(mediaId)
  ||typeof mime!=="string"||typeof url!=="string"||url.length>2000)return null;
 if(kind==="image"&&!["image/jpeg","image/png","image/webp"].includes(mime))return null;
 if(kind==="document"&&mime!=="application/pdf")return null;
 try{
  const u=new URL(url);
  if(u.protocol!=="https:"||u.hostname!=="api.ycloud.com"||u.port
   ||u.username||u.password||u.hash
   ||u.pathname!=="/v2/whatsapp/media/download/"+mediaId)return null;
 }catch{return null;}
 const rawName=typeof file?.filename==="string"?file.filename:"";
 const filename=rawName.replace(/[^\w. -]/g,"_").slice(0,120)
  ||(kind==="image"?"imagen-recibida":"comprobante-recibido.pdf");
 const rawCaption=typeof file?.caption==="string"?file.caption.trim():"";
 const rawHash=file?.sha256;
 const sha256=typeof rawHash==="string"&&/^[a-zA-Z0-9+/]{43}=$/.test(rawHash)?rawHash:null;
 const name=asObj(m?.customerProfile)?.name;
 return {
  kind,wabaId:waba,businessPhone:to,from,externalMessageId:id,
  contactName:typeof name==="string"?name.trim().slice(0,120):"",
  providerMediaId:mediaId,downloadUrl:url,mimeType:mime,filename,
  caption:rawCaption.slice(0,400),sha256
 };
}
