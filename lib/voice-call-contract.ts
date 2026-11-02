/** Pure Retell post-call event adapter (does NOT verify a signature or write CRM data).
 * Use ONLY after the server has verified x-retell-signature with Retell's SDK.
 * A tenant is NEVER chosen from caller-supplied event fields.
 */
export type AnalyzedVoiceCall={
 provider:"retell";
 callId:string;
 direction:"inbound"|"outbound";
 fromNumber:string;
 toNumber:string;
 summary:string|null;
};
const phone=/^\+[1-9][0-9]{7,14}$/;
const callId=/^call_[a-zA-Z0-9_-]{6,128}$/;
const record=(v:unknown):Record<string,unknown>|null=>
 v!==null&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:null;

/** Parses data only; do not treat the result as proof of consent or a verified tenant. */
export function parseRetellAnalyzedCall(payload:unknown):AnalyzedVoiceCall|null{
 const event=record(payload);
 if(!event||event.event!=="call_analyzed")return null;
 const call=record(event.call);
 if(!call)return null;
 const id=call.call_id,from=call.from_number,to=call.to_number;
 if(typeof id!=="string"||!callId.test(id)||
    typeof from!=="string"||!phone.test(from)||
    typeof to!=="string"||!phone.test(to)||
    (call.direction!=="inbound"&&call.direction!=="outbound"))return null;
 const analysis=record(call.call_analysis);
 const raw=analysis?.call_summary;
 const summary=typeof raw==="string"&&raw.trim()&&raw.length<=2000
  ?raw.trim():null;
 return {provider:"retell",callId:id,
  direction:call.direction as "inbound"|"outbound",
  fromNumber:from,toNumber:to,summary};
}
