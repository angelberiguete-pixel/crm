import {createClient} from "@supabase/supabase-js";
import type {NextRequest} from "next/server";
import {loadPaypalSandboxCredentials,type CrmPayableInvoice} from "@/lib/paypal-checkout";

// Same published Supabase project as the existing CRM auth client.
// The service-role key is NEVER sent to the browser.
const SUPABASE_URL="https://ygipjqgyreeahslzorik.supabase.co";
const PUBLIC_KEY="sb_publishable_2Q7aF-M61t2OZWRrt-vebQ_t_oNK_u7";
const UUID=/^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
export function isPaypalInvoiceId(value:unknown):value is string{
  return typeof value==="string"&&UUID.test(value);
}
export function paypalSandboxServerConfiguration(){
  // Fail closed even if someone mistakenly adds sandbox credentials to
  // the production deployment; live is a separate audited integration.
  if(process.env.VERCEL_ENV==="production")
    throw new Error("paypal_disabled_in_production");
  const config=loadPaypalSandboxCredentials(process.env);
  const secret=process.env.SUPABASE_SERVICE_ROLE_KEY??"";
  if(secret.length<20)throw new Error("paypal_server_database_not_configured");
  return {
    config,
    admin:createClient(SUPABASE_URL,secret,{
      auth:{persistSession:false,autoRefreshToken:false}
    }),
  };
}
export async function paypalInvoiceFromAuthorizedUser(request:NextRequest,id:unknown):
  Promise<{invoice:CrmPayableInvoice&{provider:string;amount_paid_cents:number}}>{
  if(!isPaypalInvoiceId(id))throw new Error("paypal_invalid_invoice_id");
  const header=request.headers.get("authorization")??"";
  if(!/^Bearer [A-Za-z0-9._~+/=-]+$/.test(header)||header.length>4096)
    throw new Error("paypal_login_required");
  const accessToken=header.slice(7);
  const client=createClient(SUPABASE_URL,PUBLIC_KEY,{
    global:{headers:{Authorization:"Bearer "+accessToken}},
    auth:{persistSession:false,autoRefreshToken:false}
  });
  const auth=await client.auth.getUser(accessToken);
  if(auth.error||!auth.data.user)throw new Error("paypal_login_required");
  // billing_invoices RLS: only the tenant owner/admin or platform admin
  // can SELECT this invoice. The client supplies ONLY an opaque invoice ID.
  const read=await client.from("billing_invoices")
    .select("id,tenant_id,provider,status,currency,amount_due_cents,total_cents,amount_paid_cents")
    .eq("id",id).maybeSingle();
  if(read.error||!read.data)throw new Error("paypal_invoice_not_authorized");
  const invoice=read.data as CrmPayableInvoice&{provider:string;amount_paid_cents:number};
  if(invoice.provider!=="manual"||invoice.amount_paid_cents!==0||
     invoice.amount_due_cents!==invoice.total_cents)
    throw new Error("paypal_invoice_already_managed_or_partially_paid");
  return {invoice};
}
export async function paypalSmallJson(request:NextRequest){
  const raw=await request.text();
  if(raw.length>1024)throw new Error("paypal_request_too_large");
  let data:unknown;
  try{data=JSON.parse(raw)}catch{throw new Error("paypal_invalid_request_json");}
  if(!data||typeof data!=="object"||Array.isArray(data))
    throw new Error("paypal_invalid_request_json");
  return data as Record<string,unknown>;
}
