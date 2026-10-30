/** 360dialog uses Cloud API-shaped message webhooks, plus Coexistence echoes.
 * Only TEXT is imported at this stage. No historical chat/contact bulk import.
 * Authentication is enforced by the separate Edge Function before invoking this parser.
 */
export type D360Text = {
  kind:"inbound"|"app_echo";wabaId:string;phoneNumberId:string;
  externalMessageId:string;recipient:string;contactName:string;body:string;
};
const digits=(v:unknown,a:number,b:number)=>typeof v==="string"&&
  new RegExp("^\\d{"+a+","+b+"}$").test(v);
const object=(v:unknown):Record<string,unknown>|null=>
  v!==null&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:null;

export function normalize360DialogWhatsAppTexts(payload:unknown):D360Text[]{
 const root=object(payload);
 if(!root||root.object!=="whatsapp_business_account"||!Array.isArray(root.entry))return [];
 const out:D360Text[]=[];
 for(const rawEntry of root.entry.slice(0,20)){
  const entry=object(rawEntry);
  if(!entry||!digits(entry.id,6,30)||!Array.isArray(entry.changes))continue;
  for(const rawChange of entry.changes.slice(0,20)){
   const change=object(rawChange),value=object(change?.value);
   if(!value)continue;
   if(change?.field!=="messages"&&change?.field!=="smb_message_echoes")continue;
   const phoneId=object(value.metadata)?.phone_number_id;
   if(!digits(phoneId,6,30))continue;
   const contacts=new Map<string,string>();
   if(Array.isArray(value.contacts))for(const raw of value.contacts.slice(0,50)){
    const contact=object(raw);
    if(digits(contact?.wa_id,8,20)){
     const name=object(contact?.profile)?.name;
     if(typeof name==="string")contacts.set(contact!.wa_id as string,name.trim().slice(0,120));
    }
   }
   const echo=change.field==="smb_message_echoes";
   const messages=echo?value.message_echoes:value.messages;
   if(!Array.isArray(messages))continue;
   for(const raw of messages.slice(0,50)){
    const msg=object(raw);
    if(!msg||msg.type!=="text")continue;
    const recipient=echo?msg.to:msg.from;
    const id=msg.id,body=object(msg.text)?.body;
    if(!digits(recipient,8,20)||typeof id!=="string"||id.length<3||id.length>256
       ||typeof body!=="string"||!body.trim()||body.length>1600)continue;
    out.push({
      kind:echo?"app_echo":"inbound",wabaId:entry.id as string,phoneNumberId:phoneId as string,
      externalMessageId:id,recipient:recipient as string,contactName:contacts.get(recipient as string)??"",
      body:body.trim()
    });
    if(out.length>=100)return out;
   }
  }
 }
 return out;
}
