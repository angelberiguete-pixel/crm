/** YCloud event normalization: incoming text only, no historical import or outbound.
 * The caller MUST first verify the raw YCloud-Signature (HMAC-SHA256).
 */
export type YCloudInboundText={
 wabaId:string;businessPhone:string;from:string;externalMessageId:string;
 contactName:string;body:string
};
function obj(value:unknown):Record<string,unknown>|null{
 return typeof value==="object" && value!==null && !Array.isArray(value)?value as Record<string,unknown>:null;
}
function e164(value:unknown):string|null{
 if(typeof value!=="string")return null;
 const clean=value.startsWith("+")?value:"+"+value;
 return /^\+[1-9]\d{7,14}$/.test(clean)?clean:null;
}
export function parseYCloudInboundText(payload:unknown):YCloudInboundText|null {
 const event=obj(payload);
 if(!event || event.apiVersion!=="v2" || event.type!=="whatsapp.inbound_message.received")return null;
 const m=obj(event.whatsappInboundMessage);
 if(!m || m.type!=="text")return null;
 const wabaId=m.wabaId,from=e164(m.from),to=e164(m.to);
 const id=typeof m.wamid==="string" && m.wamid.length>=3?m.wamid:m.id;
 const body=obj(m.text)?.body, name=obj(m.customerProfile)?.name;
 if(typeof wabaId!=="string" || !/^\d{6,30}$/.test(wabaId)
    ||!from||!to||typeof id!=="string"||id.length<3||id.length>256
    ||typeof body!=="string"||!body.trim()||body.length>1600)return null;
 return {wabaId,businessPhone:to,from,externalMessageId:id,
   contactName:typeof name==="string"?name.trim().slice(0,120):"",body:body.trim()};
}
