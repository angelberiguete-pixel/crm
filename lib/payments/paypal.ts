/** PayPal server-only helpers. Never expose PAYPAL_CLIENT_SECRET to the browser. */
import "server-only";
export type Currency = "USD" | "EUR";
const base = process.env.PAYPAL_ENV === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
export async function paypalToken(): Promise<string> {
  const id=process.env.PAYPAL_CLIENT_ID,secret=process.env.PAYPAL_CLIENT_SECRET;
  if(!id||!secret) throw new Error("PayPal credentials not configured");
  const response=await fetch(base+"/v1/oauth2/token",{method:"POST",headers:{Authorization:"Basic "+Buffer.from(id+":"+secret).toString("base64"),"Content-Type":"application/x-www-form-urlencoded"},body:"grant_type=client_credentials",cache:"no-store"});
  if(!response.ok) throw new Error("PayPal authentication failed");
  const body=await response.json() as {access_token:string};return body.access_token;
}
export async function paypalRequest(path:string,method:"POST"|"GET",body?:unknown,requestId?:string){
  const token=await paypalToken();
  const response=await fetch(base+path,{method,headers:{Authorization:"Bearer "+token,"Content-Type":"application/json",...(requestId?{"PayPal-Request-Id":requestId}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),cache:"no-store"});
  const payload=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error("PayPal API error: "+response.status);
  return payload;
}
export function paypalBase(){return base;}
