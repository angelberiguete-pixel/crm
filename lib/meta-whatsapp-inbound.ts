export type WhatsAppInboundText={
  wabaId:string;phoneNumberId:string;externalMessageId:string;
  sender:string;contactName:string;body:string;
};
const numeric=(v:unknown,min:number,max:number)=>typeof v==="string"&&
  new RegExp("^[0-9]{"+min+","+max+"}$").test(v);
export function normalizeVerifiedWhatsAppTexts(value:unknown):WhatsAppInboundText[]{
  if(!value||typeof value!=="object"||Array.isArray(value))return [];
  const payload=value as Record<string,unknown>;
  if(payload.object!=="whatsapp_business_account"||!Array.isArray(payload.entry))return [];
  const out:WhatsAppInboundText[]=[];
  for(const rawEntry of payload.entry.slice(0,20)){
    if(!rawEntry||typeof rawEntry!=="object")continue;
    const entry=rawEntry as Record<string,unknown>;
    if(!numeric(entry.id,6,30)||!Array.isArray(entry.changes))continue;
    for(const rawChange of entry.changes.slice(0,20)){
      if(!rawChange||typeof rawChange!=="object")continue;
      const change=rawChange as Record<string,unknown>;
      if(change.field!=="messages"||!change.value||typeof change.value!=="object")continue;
      const val=change.value as Record<string,unknown>;
      const meta=val.metadata as Record<string,unknown>|undefined;
      const phoneId=meta?.phone_number_id;
      if(!numeric(phoneId,6,30)||!Array.isArray(val.messages))continue;
      const names=new Map<string,string>();
      if(Array.isArray(val.contacts)){
        for(const c of val.contacts.slice(0,50)){
          if(!c||typeof c!=="object")continue;
          const o=c as Record<string,unknown>;
          const profile=o.profile as Record<string,unknown>|undefined;
          if(numeric(o.wa_id,8,20)&&typeof profile?.name==="string")
            names.set(o.wa_id as string,profile.name.trim().slice(0,120));
        }
      }
      for(const raw of val.messages.slice(0,50)){
        if(!raw||typeof raw!=="object")continue;
        const msg=raw as Record<string,unknown>;
        if(msg.type!=="text"||!numeric(msg.from,8,20)||
           typeof msg.id!=="string"||msg.id.length<3||msg.id.length>256)continue;
        const text=msg.text as Record<string,unknown>|undefined;
        if(typeof text?.body!=="string"||!text.body.trim()||text.body.length>1600)continue;
        out.push({
          wabaId:entry.id as string,
          phoneNumberId:phoneId as string,
          externalMessageId:msg.id,sender:msg.from as string,
          contactName:names.get(msg.from as string)??"",
          body:text.body.trim(),
        });
      }
    }
  }
  return out.slice(0,100);
}
