import { db, paypal, failure, configured, newGuestToken, guestHash, setGuestCookie } from "../../../lib/server";
export const dynamic="force-dynamic";
export async function POST(request){
 try{
  if(!configured() || !process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET || !process.env.PAYPAL_WEBHOOK_ID){
   throw Object.assign(new Error("El cobro en línea aún no está disponible."),{status:503});
  }
  const origin=request.headers.get("origin");
  if(origin && origin !== new URL(request.url).origin)throw Object.assign(new Error("Invalid origin"),{status:403});
  const input=await request.json();
  if(input.website)throw Object.assign(new Error("Invalid request"),{status:400});
  const name=String(input.buyer_name||"").trim().replace(/\s+/g," ").slice(0,120);
  const email=String(input.buyer_email||"").trim().toLowerCase().slice(0,254);
  if(name.length<3 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Object.assign(new Error("Nombre y correo válidos son obligatorios."),{status:400});
  const productId=String(input.product_id||"");
  if(!/^[0-9a-f-]{36}$/i.test(productId))throw Object.assign(new Error("Producto no válido"),{status:400});
  const admin=db();
  const {data:p,error:e}=await admin.from("commerce_products").select("id,name,category,price_cents,currency,published,asset_path,stock_qty").eq("id",productId).single();
  if(e || !p || !p.published)throw Object.assign(new Error("Este servicio no está disponible para compra"),{status:404});
  if(["membresia","fisico"].includes(p.category))throw Object.assign(new Error("Esta modalidad aún requiere coordinación manual"),{status:409});
  if(p.category==="digital"&&!p.asset_path)throw Object.assign(new Error("El recurso todavía no está publicado"),{status:409});
  if(p.category==="curso"&&!p.asset_path){
   const {count,error:lessonError}=await admin.from("commerce_lessons").select("id",{count:"exact",head:true}).eq("product_id",p.id);
   if(lessonError)throw lessonError;
   if(!count)throw Object.assign(new Error("El curso todavía no tiene lecciones"),{status:409});
  }
  const token=newGuestToken();
  const {data:order,error:orderError}=await admin.from("commerce_orders").insert({
   buyer_id:null,buyer_name:name,buyer_email:email,guest_token_hash:guestHash(token),
   product_id:p.id,status:"pending",amount_cents:p.price_cents,currency:p.currency
  }).select("id").single();
  if(orderError)throw orderError;
  const url=new URL(request.url).origin;
  const created=await paypal("/v2/checkout/orders","POST",{
   intent:"CAPTURE",
   purchase_units:[{reference_id:order.id,description:p.name.slice(0,120),amount:{currency_code:p.currency,value:(p.price_cents/100).toFixed(2)}}],
   application_context:{return_url:url+"/?checkout=return",cancel_url:url+"/?checkout=cancel",brand_name:"Ángel Berigüete",user_action:"PAY_NOW"}
  },order.id);
  const {error:linkError}=await admin.from("commerce_orders").update({paypal_order_id:created.id}).eq("id",order.id);
  if(linkError)throw linkError;
  const approve=created.links?.find(link=>link.rel==="approve"||link.rel==="payer-action")?.href;
  if(!approve||!approve.startsWith("https://"))throw new Error("PayPal no devolvió una página de pago segura");
  const result=Response.json({approve_url:approve,order_id:order.id});
  return setGuestCookie(result,request,token);
 }catch(error){return failure(error);}
}
