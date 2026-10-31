export type QuoteButtonAction="approve_request"|"request_changes"|"talk_to_advisor";
export type QuoteButtonReply={quoteId:string;action:QuoteButtonAction};
const QUOTE_ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const buttons=[
 {action:"approve_request" as const,title:"Quiero aprobar"},
 {action:"request_changes" as const,title:"Solicitar cambios"},
 {action:"talk_to_advisor" as const,title:"Hablar con asesor"}
];
/** YCloud/WhatsApp interactive reply buttons for an EXISTING quote.
 * Build only from verified quote ID, not from raw customer-supplied text.
 * Does not claim legal acceptance, change quotation status or send anything.
 */
export function buildQuoteInteractiveMessage(quoteId:string,quoteNumber:string,amountText:string){
 if(!QUOTE_ID.test(quoteId))throw new Error("Invalid quotation ID");
 if(!quoteNumber.trim()||quoteNumber.length>80||amountText.length>80)throw new Error("Invalid quotation summary");
 return {
   type:"interactive" as const,
   interactive:{
     type:"button" as const,
     body:{text:"Cotización "+quoteNumber.trim()+" · "+amountText.trim()+"\n¿Te gustaría continuar? Tu selección será revisada antes de confirmar cualquier compra."},
     action:{buttons:buttons.map(({action,title})=>({
       type:"reply" as const,reply:{id:"q:"+quoteId+":"+action,title}
     }))}
   }
 };
}
/** Parse webhook interactive.button_reply.id only after provider signature,
 * tenant routing, recipient identity and quote ownership were verified.
 */
export function parseQuoteButtonReply(input:unknown):QuoteButtonReply|null{
 if(typeof input!=="string"||input.length>120)return null;
 const match=/^q:([0-9a-f-]{36}):(approve_request|request_changes|talk_to_advisor)$/i.exec(input);
 if(!match||!QUOTE_ID.test(match[1]))return null;
 return {quoteId:match[1].toLowerCase(),action:match[2] as QuoteButtonAction};
}
