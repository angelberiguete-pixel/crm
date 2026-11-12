import {createClient} from "npm:@supabase/supabase-js@2.116.0";

const url=Deno.env.get("SUPABASE_URL")??"";
const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??"";
const anonKey=Deno.env.get("SUPABASE_ANON_KEY")??"";
// Canonical authorized origin for PayPal checkout returns. Never trust a request Origin header.
const origin="https://portal-empresia.vercel.app";
const cors={
 "Access-Control-Allow-Origin":"*",
 "Access-Control-Allow-Headers":"authorization, apikey, x-client-info, content-type",
 "Access-Control-Allow-Methods":"POST, OPTIONS",
};
const reply=(payload:unknown,status=200)=>new Response(JSON.stringify(payload),{
 status,headers:{...cors,"Content-Type":"application/json","Cache-Control":"no-store"}
});
const admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
const usd=(cents:number)=>(cents/100).toFixed(2);
const paypalBase=()=>{
 const mode=Deno.env.get("PAYPAL_ENVIRONMENT");
 if(mode==="live")return "https://api-m.paypal.com";
 if(mode==="sandbox")return "https://api-m.sandbox.paypal.com";
 throw Error("paypal_not_configured");
};
async function paypalToken():Promise<string>{
 const id=Deno.env.get("PAYPAL_CLIENT_ID")??"";
 const secret=Deno.env.get("PAYPAL_CLIENT_SECRET")??"";
 if(!id||!secret)throw Error("paypal_not_configured");
 const response=await fetch(paypalBase()+"/v1/oauth2/token",{
  method:"POST",headers:{
   Authorization:"Basic "+btoa(id+":"+secret),
   "Content-Type":"application/x-www-form-urlencoded"
  },body:"grant_type=client_credentials",signal:AbortSignal.timeout(12000)
 });
 if(!response.ok)throw Error("paypal_auth_failed");
 const data=await response.json();
 if(typeof data.access_token!=="string")throw Error("paypal_auth_failed");
 return data.access_token;
}
async function paypal<T>(
 token:string,path:string,method="GET",payload?:unknown,requestId?:string
):Promise<T>{
 const response=await fetch(paypalBase()+path,{
  method,headers:{
   Authorization:"Bearer "+token,Accept:"application/json",
   ...(payload!==undefined?{"Content-Type":"application/json"}:{}),
   ...(requestId?{"PayPal-Request-Id":requestId}:{})
  },
  body:payload===undefined?undefined:JSON.stringify(payload),
  signal:AbortSignal.timeout(19000)
 });
 if(!response.ok)throw Error("paypal_http_"+response.status);
 if(response.status===204)return {} as T;
 return response.json() as Promise<T>;
}
type Offer={
 id:string;slug:string;title:string;kind:"one_time"|"monthly";
 usd_price_cents:number;status:string;paypal_plan_id:string|null;
 fulfillment:string;paypal_product_id:string|null
};
type Order={
 id:string;buyer_id:string;offer_id:string;kind:"one_time"|"monthly";
 amount_cents:number;status:string;paypal_order_id:string|null;
 paypal_subscription_id:string|null;approval_url:string|null;
};
type PayPalLink={rel:string;href:string};
const uuid=(x:unknown):x is string=>typeof x==="string" &&
 /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
const safeSlug=(x:unknown):x is string=>typeof x==="string"&&/^[a-z0-9][a-z0-9-]{2,70}$/.test(x);
const parseAmount=(s:unknown):number=>{
 if(typeof s!=="string"||!/^\d+(\.\d{1,2})?$/.test(s))return NaN;
 const [integer,decimal=""]=s.split(".");
 const cents=Number(integer)*100+Number(decimal.padEnd(2,"0"));
 return Number.isSafeInteger(cents)?cents:NaN;
};
async function confirmOneTime(order:Order,token:string){
 if(!order.paypal_order_id)return {status:"not_created"};
 const pp=await paypal<{
  id:string;status:string;
  purchase_units?:Array<{
   reference_id?:string;amount?:{currency_code:string;value:string};
   payments?:{captures?:Array<{
    id:string;status:string;amount:{currency_code:string;value:string}
   }>}
  }>
 }>(token,"/v2/checkout/orders/"+encodeURIComponent(order.paypal_order_id));
 if(pp.id!==order.paypal_order_id||pp.status!=="COMPLETED")
  return {status:pp.status==="APPROVED"?"approved_not_captured":"awaiting_payment"};
 const unit=pp.purchase_units?.[0];
 const capture=unit?.payments?.captures?.find(c=>c.status==="COMPLETED");
 if(unit?.reference_id!==order.id
  ||unit?.amount?.currency_code!=="USD"
  ||parseAmount(unit?.amount?.value)!==order.amount_cents
  ||capture?.amount?.currency_code!=="USD"
  ||parseAmount(capture.amount.value)!==order.amount_cents
  ||!capture.id)throw Error("paypal_order_mismatch");
 const {data,error}=await admin.rpc("empresia_confirm_checkout_capture",{
  p_order_id:order.id,p_paypal_order_id:pp.id,
  p_capture_id:capture.id,p_cents:order.amount_cents
 });
 if(error)throw Error("checkout_reconciliation_failed");
 return data;
}
async function confirmSubscription(order:Order,token:string){
 if(!order.paypal_subscription_id)return {status:"not_created"};
 const pp=await paypal<{id:string;status:string;plan_id:string;custom_id?:string}>(
  token,"/v1/billing/subscriptions/"+encodeURIComponent(order.paypal_subscription_id)
 );
 const {data:offer}=await admin.from("empresia_offers")
  .select("paypal_plan_id").eq("id",order.offer_id).single();
 if(pp.id!==order.paypal_subscription_id||pp.custom_id!==order.id
   ||pp.plan_id!==offer?.paypal_plan_id)throw Error("paypal_subscription_mismatch");
 const accepted=["ACTIVE","CANCELLED","SUSPENDED","EXPIRED","APPROVAL_PENDING"];
 if(!accepted.includes(pp.status))return {status:"unverified"};
 const {data,error}=await admin.rpc("empresia_confirm_subscription_state",{
  p_subscription_id:pp.id,p_paypal_state:pp.status
 });
 if(error)throw Error("subscription_reconciliation_failed");
 return data;
}

Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 if(req.method!=="POST")return reply({error:"method_not_allowed"},405);
 try{
  if(!url||!serviceKey||!anonKey)throw Error("supabase_not_configured");
  const authorization=req.headers.get("Authorization")??"";
  if(!/^Bearer\s+\S+$/.test(authorization))return reply({error:"login_required"},401);
  const userClient=createClient(url,anonKey,{
   global:{headers:{Authorization:authorization}},
   auth:{persistSession:false,autoRefreshToken:false}
  });
  const {data:auth,error:authError}=await userClient.auth.getUser(authorization.slice(7));
  if(authError||!auth?.user)return reply({error:"login_required"},401);
  const buyer=auth.user;
  const input=await req.json().catch(()=>null) as Record<string,unknown>|null;
  if(!input||typeof input!=="object"||Array.isArray(input))
   return reply({error:"invalid_request"},400);
  const action=input.action;

  if(action==="publish_plan"){
   // Only a platform owner can provision PayPal products and recurring plans.
   const {error:access}=await userClient.rpc("crm_billing_financial_snapshot",{p_tenant_id:null});
   if(access)return reply({error:"platform_owner_required"},403);
   if(!uuid(input.offer_id))return reply({error:"invalid_offer"},400);
   const {data:raw}=await admin.from("empresia_offers").select("*")
    .eq("id",input.offer_id).maybeSingle();
   const offer=raw as Offer|null;
   if(!offer||offer.kind!=="monthly")return reply({error:"not_monthly"},422);
   // Real checkout must never publish a Sandbox subscription plan.
   if(Deno.env.get("PAYPAL_ENVIRONMENT")!=="live")
     return reply({error:"paypal_live_required"},409);
   if(!["draft","published"].includes(offer.status))
     return reply({error:"not_publishable"},409);
   const token=await paypalToken();
   // Validate the actual billing plan with PayPal, not merely a saved plan ID.
   async function verifiedPlan(planId:string,productId:string){
     const detail=await paypal<{
       id:string;status:string;product_id:string;
       billing_cycles?:Array<{
         tenure_type:string;frequency?:{interval_unit:string;interval_count:number};
         pricing_scheme?:{fixed_price?:{value:string;currency_code:string}}
       }>
     }>(token,"/v1/billing/plans/"+encodeURIComponent(planId));
     const recurring=detail.billing_cycles?.find(x=>x.tenure_type==="REGULAR");
     if(detail.id!==planId||detail.status!=="ACTIVE"
       ||detail.product_id!==productId
       ||recurring?.frequency?.interval_unit!=="MONTH"
       ||recurring?.frequency?.interval_count!==1
       ||recurring?.pricing_scheme?.fixed_price?.currency_code!=="USD"
       ||parseAmount(recurring?.pricing_scheme?.fixed_price?.value)!==offer.usd_price_cents)
       throw Error("paypal_plan_mismatch");
   }
   if(offer.paypal_plan_id){
     if(!offer.paypal_product_id)throw Error("paypal_plan_mismatch");
     await verifiedPlan(offer.paypal_plan_id,offer.paypal_product_id);
     return reply({status:"ready",plan_id:offer.paypal_plan_id,environment:"live"});
   }
   if(offer.status!=="draft")return reply({error:"must_be_draft"},409);
   let productId=offer.paypal_product_id;
   if(!productId){
    const product=await paypal<{id:string}>(
     token,"/v1/catalogs/products","POST",{
      name:offer.title,description:offer.slug,type:"SERVICE"
     },"empresia-offer-product-"+offer.id
    );
    if(!product.id?.startsWith("PROD-"))throw Error("paypal_product_invalid");
    productId=product.id;
    const {error}=await admin.from("empresia_offers")
     .update({paypal_product_id:productId,updated_at:new Date().toISOString()})
     .eq("id",offer.id);
    if(error)throw Error("storage_error");
   }
   const pp=await paypal<{id:string}>(
    token,"/v1/billing/plans","POST",{
     product_id:productId,name:offer.title,
     description:"Suscripción mensual Empresia. Sujeto a aprobación del comprador.",
     status:"ACTIVE",
     billing_cycles:[{
      frequency:{interval_unit:"MONTH",interval_count:1},
      tenure_type:"REGULAR",sequence:1,total_cycles:0,
      pricing_scheme:{fixed_price:{value:usd(offer.usd_price_cents),currency_code:"USD"}}
     }],
     payment_preferences:{
      auto_bill_outstanding:true,
      setup_fee_failure_action:"CONTINUE",payment_failure_threshold:3
     }
    },"empresia-offer-plan-"+offer.id
   );
   if(!/^P-[A-Z0-9]+$/.test(pp.id))throw Error("paypal_plan_invalid");
   await verifiedPlan(pp.id,productId);
   const {error}=await admin.from("empresia_offers").update({
     paypal_plan_id:pp.id,updated_at:new Date().toISOString()
   }).eq("id",offer.id).is("paypal_plan_id",null);
   if(error)throw Error("storage_error");
   return reply({status:"ready",plan_id:pp.id,environment:"live"});
  }

  if(action==="checkout"){
   if(!safeSlug(input.offer_slug))return reply({error:"invalid_offer"},400);
   const {data:raw,error:offerError}=await admin.from("empresia_offers")
    .select("*").eq("slug",input.offer_slug).eq("status","published").maybeSingle();
   if(offerError||!raw)return reply({error:"offer_not_published"},404);
   const offer=raw as Offer;
   if(!Number.isSafeInteger(offer.usd_price_cents)||offer.usd_price_cents<100)
    return reply({error:"invalid_price"},422);
   if(offer.kind==="monthly"&&!offer.paypal_plan_id)
    return reply({error:"subscription_not_ready"},409);

   const {data:owned}=await admin.from("empresia_entitlements")
    .select("id,status").eq("buyer_id",buyer.id).eq("offer_id",offer.id)
    .in("status",["active","provisioning"]).limit(1);
   if((owned?.length??0)>0)return reply({error:"already_purchased"},409);

   // Reuse an existing unfinished checkout for the same user+offer.
   const cutoff=new Date(Date.now()-70*60*1000).toISOString();
   let pendingQuery=admin.from("empresia_checkout_orders")
    .select("id,approval_url,status").eq("buyer_id",buyer.id)
    .eq("offer_id",offer.id).eq("status","awaiting_approval");
   if(offer.kind==="one_time")pendingQuery=pendingQuery.gt("created_at",cutoff);
   const {data:pending}=await pendingQuery.order("created_at",{ascending:false}).limit(1);
   if(pending?.[0]?.approval_url)
    return reply({status:"awaiting_approval",order_id:pending[0].id,approval_url:pending[0].approval_url});

   const {data:recent}=await admin.from("empresia_checkout_orders")
    .select("id").eq("buyer_id",buyer.id)
    .gt("created_at",new Date(Date.now()-60000).toISOString()).limit(5);
   if((recent?.length??0)>=3)return reply({error:"too_many_attempts"},429);

   const {data:seller}=await admin.from("tenants").select("id").eq("slug","eurevector").single();
   if(!seller)throw Error("seller_not_configured");
   const {data:created,error:createError}=await admin.from("empresia_checkout_orders")
    .insert({
     seller_tenant_id:seller.id,offer_id:offer.id,buyer_id:buyer.id,
     buyer_email:buyer.email??"",kind:offer.kind,amount_cents:offer.usd_price_cents
    }).select("id").single();
   if(createError||!created)throw Error("storage_error");
   const orderId=created.id as string;
   try{
   const token=await paypalToken();
   let providerId:string|undefined,approval:string|undefined;
   if(offer.kind==="one_time"){
    const pp=await paypal<{id:string;links:PayPalLink[]}>(
     token,"/v2/checkout/orders","POST",{
      intent:"CAPTURE",
      purchase_units:[{
       reference_id:orderId,custom_id:orderId,
       description:offer.title,
       amount:{currency_code:"USD",value:usd(offer.usd_price_cents)}
      }],
      payment_source:{paypal:{experience_context:{
       brand_name:"Empresia",
       user_action:"PAY_NOW",
       return_url:origin+"/empresia/checkout?order="+orderId+"&paypal=approved",
       cancel_url:origin+"/empresia/checkout?order="+orderId+"&paypal=cancelled"
      }}}
     },"empresia-once-"+orderId
    );
    providerId=pp.id;
    approval=pp.links?.find(link=>["payer-action","approve"].includes(link.rel))?.href;
   }else{
    const pp=await paypal<{id:string;links:PayPalLink[]}>(
     token,"/v1/billing/subscriptions","POST",{
      plan_id:offer.paypal_plan_id,custom_id:orderId,
      application_context:{
       brand_name:"Empresia",
       user_action:"SUBSCRIBE_NOW",
       return_url:origin+"/empresia/checkout?order="+orderId+"&paypal=approved",
       cancel_url:origin+"/empresia/checkout?order="+orderId+"&paypal=cancelled"
      }
     },"empresia-monthly-"+orderId
    );
    providerId=pp.id;
    approval=pp.links?.find(link=>link.rel==="approve")?.href;
   }
   if(!providerId||!approval||!approval.startsWith("https://www.paypal.com/")){
    throw Error("provider_order_invalid");
   }
   const write=offer.kind==="one_time"
    ?{paypal_order_id:providerId,approval_url:approval,status:"awaiting_approval"}
    :{paypal_subscription_id:providerId,approval_url:approval,status:"awaiting_approval"};
   const {error:saveError}=await admin.from("empresia_checkout_orders")
    .update(write).eq("id",orderId);
   if(saveError)throw Error("storage_error");
   return reply({status:"awaiting_approval",order_id:orderId,approval_url:approval});
   }catch(e){
     // Do not leave a failed provider request locking a monthly buyer forever.
     await admin.from("empresia_checkout_orders").update({
       status:"failed",updated_at:new Date().toISOString()
     }).eq("id",orderId).eq("status","created");
     throw e;
   }
  }

  if(action==="sync"||action==="capture"||action==="cancel_subscription"){
   if(!uuid(input.order_id))return reply({error:"invalid_order"},400);
   const {data:raw}=await admin.from("empresia_checkout_orders")
    .select("*").eq("id",input.order_id).eq("buyer_id",buyer.id).maybeSingle();
   if(!raw)return reply({error:"order_not_found"},404);
   const order=raw as Order;
   if(action==="cancel_subscription"){
     if(order.kind!=="monthly"||!order.paypal_subscription_id)
       return reply({error:"not_a_subscription"},422);
     const token=await paypalToken();
     const path="/v1/billing/subscriptions/"+encodeURIComponent(order.paypal_subscription_id);
     const before=await paypal<{id:string;status:string;custom_id?:string;plan_id?:string}>(token,path);
     const {data:offer}=await admin.from("empresia_offers")
       .select("paypal_plan_id").eq("id",order.offer_id).single();
     if(before.id!==order.paypal_subscription_id||before.custom_id!==order.id
       ||before.plan_id!==offer?.paypal_plan_id)
       throw Error("paypal_subscription_mismatch");
     if(!["CANCELLED","EXPIRED"].includes(before.status)){
       if(!["ACTIVE","SUSPENDED"].includes(before.status))
         return reply({error:"not_yet_active"},409);
       await paypal(token,path+"/cancel","POST",
         {reason:"Cancellation requested by the authenticated subscriber"});
     }
     const latest=await paypal<{id:string;status:string}>(token,path);
     if(latest.id!==order.paypal_subscription_id)throw Error("paypal_subscription_mismatch");
     if(latest.status==="CANCELLED"||latest.status==="EXPIRED"){
       const {data,error}=await admin.rpc("empresia_confirm_subscription_state",{
         p_subscription_id:latest.id,p_paypal_state:latest.status
       });
       if(error)throw Error("subscription_reconciliation_failed");
       return reply({status:data?.status??"cancelled",order_id:order.id});
     }
     return reply({status:"cancellation_pending",order_id:order.id});
   }
   if(["paid","cancelled","active"].includes(order.status))
     return reply({status:order.status,order_id:order.id});
   if(order.status!=="awaiting_approval")
     return reply({status:order.status,order_id:order.id});
   const token=await paypalToken();
   if(order.kind==="monthly"){
    const result=await confirmSubscription(order,token);
    return reply({status:result?.status??"unverified",order_id:order.id});
   }
   if(!order.paypal_order_id)return reply({error:"missing_paypal_order"},409);
   if(action==="capture"){
    const current=await paypal<{id:string;status:string;purchase_units?:Array<{
       reference_id?:string;amount?:{currency_code:string;value:string}
     }>}>(
      token,"/v2/checkout/orders/"+encodeURIComponent(order.paypal_order_id)
    );
    if(current.id!==order.paypal_order_id
       ||current.purchase_units?.[0]?.reference_id!==order.id
       ||current.purchase_units?.[0]?.amount?.currency_code!=="USD"
       ||parseAmount(current.purchase_units[0].amount?.value)!==order.amount_cents)
      throw Error("paypal_order_mismatch");
    if(current.status==="APPROVED"){
      await paypal(token,
       "/v2/checkout/orders/"+encodeURIComponent(order.paypal_order_id)+"/capture",
       "POST",{},"empresia-capture-"+order.id);
    }else if(current.status!=="COMPLETED"){
      return reply({status:"awaiting_payment",order_id:order.id});
    }
   }
   const result=await confirmOneTime(order,token);
   return reply({status:result?.status??"awaiting_payment",order_id:order.id});
  }
  return reply({error:"unsupported_action"},400);
 }catch(e){
  const code=e instanceof Error?e.message:"unknown";
  if(code==="paypal_not_configured")return reply({error:"paypal_not_configured"},503);
  if(code==="paypal_plan_mismatch")return reply({error:"paypal_plan_mismatch"},409);
  // Errors are intentionally generic: never log provider credentials or payer details.
  return reply({error:"checkout_not_completed"},503);
 }
});
