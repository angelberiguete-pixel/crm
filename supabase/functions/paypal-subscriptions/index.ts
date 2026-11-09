import { createClient } from "npm:@supabase/supabase-js@2.116.0";

const url=Deno.env.get("SUPABASE_URL")??"";
const adminKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??"";
const clientKey=Deno.env.get("SUPABASE_ANON_KEY")??"";
const allowedOrigin="https://crm-revenue-os.vercel.app";
const headers={"Content-Type":"application/json","Cache-Control":"no-store"};
const result=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
const safeUuid=(v:unknown):v is string=>typeof v==="string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);
const admin=createClient(url,adminKey,{auth:{persistSession:false,autoRefreshToken:false}});
const environment=()=>Deno.env.get("PAYPAL_ENVIRONMENT")==="live"
  ?"https://api-m.paypal.com"
  :Deno.env.get("PAYPAL_ENVIRONMENT")==="sandbox"
    ?"https://api-m.sandbox.paypal.com":null;

async function paypalToken(){
  const id=Deno.env.get("PAYPAL_CLIENT_ID")??"";
  const secret=Deno.env.get("PAYPAL_CLIENT_SECRET")??"";
  const host=environment();
  if(!id||!secret||!host)throw Error("paypal_not_configured");
  const r=await fetch(host+"/v1/oauth2/token",{
    method:"POST",headers:{
      Authorization:"Basic "+btoa(id+":"+secret),
      "Content-Type":"application/x-www-form-urlencoded"
    },body:"grant_type=client_credentials",signal:AbortSignal.timeout(12000)
  });
  if(!r.ok)throw Error("paypal_auth_failed");
  const body=await r.json();
  if(typeof body.access_token!=="string")throw Error("paypal_token_missing");
  return body.access_token as string;
}

async function paypalRequest<T>(token:string,path:string,method="GET",body?:unknown,requestId?:string):Promise<T>{
  const host=environment();if(!host)throw Error("paypal_not_configured");
  const r=await fetch(host+path,{
    method,
    headers:{
      Authorization:"Bearer "+token,
      Accept:"application/json",
      ...(body===undefined?{}:{"Content-Type":"application/json"}),
      ...(requestId?{"PayPal-Request-Id":requestId}:{})
    },
    body:body===undefined?undefined:JSON.stringify(body),
    signal:AbortSignal.timeout(20000)
  });
  if(!r.ok)throw Error("paypal_api_"+r.status);
  if(r.status===204)return {} as T;
  return await r.json() as T;
}

type Plan={
  id:string;plan_key:string;description:string;provider_product_id:string|null;
  provider_plan_id:string|null;amount_cents:number;status:string;
};
type TenantSub={
  id:string;tenant_id:string;status:string;provider_subscription_id:string|null;
  provider_approval_url:string|null;provider_approval_state:string;current_period_end:string|null;
};
type PaypalLink={rel:string;href:string};

Deno.serve(async(req:Request)=>{
  if(req.method!=="POST")return result({error:"method_not_allowed"},405);
  try{
    if(!url||!adminKey||!clientKey)throw Error("supabase_config_missing");
    const auth=req.headers.get("Authorization")??"";
    if(!/^Bearer\s+\S+$/.test(auth))return result({error:"unauthorized"},401);
    const user=createClient(url,clientKey,{
      global:{headers:{Authorization:auth}},
      auth:{persistSession:false,autoRefreshToken:false}
    });
    const {data:who,error:authError}=await user.auth.getUser(auth.slice(7));
    if(authError||!who?.user)return result({error:"unauthorized"},401);
    const payload=await req.json().catch(()=>null) as Record<string,unknown>|null;
    if(!payload||Array.isArray(payload)||typeof payload!=="object")return result({error:"bad_request"},400);
    const action=payload.action;
    if(action==="ensure_plan"){
      // This read-only owner RPC is also the authorization guard.
      const {error:accessError}=await user.rpc("crm_billing_financial_snapshot",{p_tenant_id:null});
      if(accessError)return result({error:"platform_owner_required"},403);
      const planKey="family-power-arm-usd80-month";
      const {data:plan,error:planError}=await admin.from("billing_gateway_plans").select("*").eq("plan_key",planKey).single();
      if(planError||!plan)return result({error:"plan_not_found"},404);
      const record=plan as Plan;
      if(record.amount_cents!==8000)return result({error:"plan_amount_mismatch"},409);
      if(record.status==="ready"&&record.provider_plan_id)
        return result({status:"ready",plan_id:record.provider_plan_id});
      if(record.status==="provisioning")
        return result({error:"plan_in_progress"},409);
      const {data:lock}=await admin.from("billing_gateway_plans")
        .update({status:"provisioning",updated_at:new Date().toISOString()})
        .eq("id",record.id).neq("status","provisioning").select("id").maybeSingle();
      if(!lock)return result({error:"plan_in_progress"},409);
      try{
        const token=await paypalToken();
        let productId=record.provider_product_id;
        if(!productId){
          const product=await paypalRequest<{id:string}>(token,"/v1/catalogs/products","POST",{
            name:"Family Power ARM",description:"Licencia y mantenimiento de plataforma Family Power ARM",
            type:"SERVICE"
          },"family-power-arm-usd80-product-v1");
          if(!/^PROD-/.test(product.id))throw Error("paypal_product_invalid");
          productId=product.id;
          const {error:saveProductError}=await admin.from("billing_gateway_plans")
            .update({provider_product_id:productId,updated_at:new Date().toISOString()}).eq("id",record.id);
          if(saveProductError)throw Error("plan_storage_error");
        }
        const paypalPlan=await paypalRequest<{id:string;status:string}>(token,"/v1/billing/plans","POST",{
          product_id:productId,
          name:"Family Power ARM - USD 80 monthly",
          description:"Licencia y mantenimiento mensual. Requiere aprobacion del cliente.",
          status:"ACTIVE",
          billing_cycles:[{
            frequency:{interval_unit:"MONTH",interval_count:1},
            tenure_type:"REGULAR",sequence:1,total_cycles:0,
            pricing_scheme:{fixed_price:{value:"80.00",currency_code:"USD"}}
          }],
          payment_preferences:{
            auto_bill_outstanding:true,
            setup_fee_failure_action:"CONTINUE",
            payment_failure_threshold:3
          }
        },"family-power-arm-usd80-plan-v1");
        if(typeof paypalPlan.id!=="string"||!/^P-/.test(paypalPlan.id))
          throw Error("paypal_plan_invalid");
        const {error:savePlanError}=await admin.from("billing_gateway_plans").update({
          provider_plan_id:paypalPlan.id,status:"ready",updated_at:new Date().toISOString()
        }).eq("id",record.id);
        if(savePlanError)throw Error("plan_storage_error");
        return result({status:"ready",plan_id:paypalPlan.id});
      }catch(error){
        await admin.from("billing_gateway_plans").update({
          status:"error",updated_at:new Date().toISOString()
        }).eq("id",record.id);
        throw error;
      }
    }

    if(action==="start_subscription"||action==="check_subscription"){
      if(!safeUuid(payload.tenant_id))return result({error:"invalid_tenant"},400);
      const tenantId=payload.tenant_id;
      const {error:permissionError}=await user.rpc("crm_billing_financial_snapshot",{p_tenant_id:tenantId});
      if(permissionError)return result({error:"tenant_owner_required"},403);
      const {data:tenant}=await admin.from("tenants").select("slug").eq("id",tenantId).single();
      if(tenant?.slug!=="family-power")return result({error:"unsupported_plan"},422);
      const {data:subscription}=await admin.from("tenant_subscriptions")
        .select("id,tenant_id,status,provider_subscription_id,provider_approval_url,provider_approval_state,current_period_end")
        .eq("tenant_id",tenantId).maybeSingle();
      if(!subscription)return result({error:"subscription_record_missing"},404);
      const current=subscription as TenantSub;
      const {data:plan}=await admin.from("billing_gateway_plans")
        .select("id,provider_plan_id,status,amount_cents").eq("plan_key","family-power-arm-usd80-month").single();
      if(!plan||plan.status!=="ready"||!plan.provider_plan_id||plan.amount_cents!==8000)
        return result({error:"paypal_plan_not_ready"},409);

      if(action==="check_subscription"){
        if(!current.provider_subscription_id)
          return result({status:"not_requested"});
        const token=await paypalToken();
        const pp=await paypalRequest<{id:string;status:string}>(
          token,"/v1/billing/subscriptions/"+encodeURIComponent(current.provider_subscription_id));
        if(pp.id!==current.provider_subscription_id)throw Error("paypal_subscription_mismatch");
        if(pp.status==="ACTIVE"){
          const {error:verifyError}=await admin.rpc("crm_record_verified_billing_event",{
            p_event_id:"verified-"+current.provider_subscription_id+"-ACTIVE",
            p_event_type:"BILLING.SUBSCRIPTION.ACTIVATED",
            p_provider_subscription_id:current.provider_subscription_id
          });
          if(verifyError)throw Error("subscription_status_storage_failed");
        }
        return result({status:pp.status});
      }

      if(current.provider_subscription_id){
        return result({status:current.provider_approval_state==="approved"?"active":"awaiting_buyer",
          approval_url:current.provider_approval_state==="awaiting_buyer"?current.provider_approval_url:null});
      }

      const {data:invoices}=await admin.from("billing_invoices")
        .select("status,amount_due_cents,metadata").eq("tenant_id",tenantId).limit(100);
      const paidInitial=(invoices??[]).some((entry)=>{
        const meta=entry.metadata as Record<string,unknown>|null;
        return meta?.billing_stage==="initial" && entry.status==="paid" && entry.amount_due_cents===0;
      });
      if(!paidInitial)return result({error:"initial_fee_not_verified"},409);

      const token=await paypalToken();
      const start=Date.parse(current.current_period_end??"");
      const paymentStart=Number.isFinite(start) && start>Date.now()+3*3600_000
        ?new Date(start).toISOString():undefined;
      const sub=await paypalRequest<{id:string;status:string;links:PaypalLink[]}>(
        token,"/v1/billing/subscriptions","POST",{
          plan_id:plan.provider_plan_id,
          custom_id:current.id,
          ...(paymentStart?{start_time:paymentStart}:{}),
          application_context:{
            brand_name:"Ángel Berigüete - Family Power ARM",
            user_action:"SUBSCRIBE_NOW",
            return_url:allowedOrigin+"/crm/pagos?paypal=approved",
            cancel_url:allowedOrigin+"/crm/pagos?paypal=cancelled"
          }
        },"family-power-arm-sub-"+current.id);
      const approve=sub.links?.find(item=>item.rel==="approve")?.href;
      if(!/^I-[A-Z0-9]+$/.test(sub.id)||!approve||!approve.startsWith("https://www.paypal.com/"))
        throw Error("paypal_subscription_response_invalid");
      const {data:saved,error:saveError}=await admin.from("tenant_subscriptions").update({
        provider:"paypal",provider_subscription_id:sub.id,provider_plan_id:plan.provider_plan_id,
        provider_approval_url:approve,provider_approval_state:"awaiting_buyer",
        updated_at:new Date().toISOString()
      }).eq("id",current.id).is("provider_subscription_id",null).select("id").maybeSingle();
      if(saveError||!saved)throw Error("subscription_storage_error");
      return result({status:"awaiting_buyer",approval_url:approve});
    }
    return result({error:"unsupported_action"},400);
  }catch(error){
    // Provider errors are not returned verbatim; prevent leaking API credentials and details.
    const code=error instanceof Error?error.message:"unexpected_error";
    return result({error:code==="paypal_not_configured"?"paypal_not_configured":"subscription_operation_failed"},503);
  }
});
