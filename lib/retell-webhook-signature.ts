/** Retell webhook verification, independent of vendor SDK and usable in Deno/Node.
 * Expected signed header: v=<unix milliseconds>,d=<SHA-256 hex HMAC>.
 * HMAC input is EXACT raw request text concatenated with timestamp.
 * Validate against official SDK before connecting any real phone route.
 */
const encoder=new TextEncoder();
const maxAgeMs=300_000;
const hexBytes=(s:string):Uint8Array=>
 Uint8Array.from(s.match(/../g)??[],b=>parseInt(b,16));

export async function verifyRetellWebhookSignature(
 rawBody:string,header:string|null,key:string|undefined,now=Date.now()
):Promise<boolean>{
 if(!key||key.length<32||typeof rawBody!=="string"||!rawBody
   ||encoder.encode(rawBody).byteLength>262_144||typeof header!=="string")return false;
 const match=/^v=(\d{13}),d=([0-9a-fA-F]{64})$/.exec(header.trim());
 if(!match)return false;
 const stamp=Number(match[1]);
 if(!Number.isSafeInteger(stamp)||Math.abs(now-stamp)>maxAgeMs)return false;
 const secret=await crypto.subtle.importKey("raw",encoder.encode(key),
   {name:"HMAC",hash:"SHA-256"},false,["verify"]);
 return crypto.subtle.verify("HMAC",secret,hexBytes(match[2]),encoder.encode(rawBody+match[1]));
}
