import { db, viewer, paypal, failure, configured } from "../../../lib/server";
export const dynamic="force-dynamic";
export async function POST(request){
 try{
 if(!configured() || !process.env.PAYPAL_WEBHOOK_ID) throw Object.assign(new Error("Checkout not configured"),{status:503});
 const user=await viewer(request);
 const {product_id}=await request.json();
 if(typeof product_id!=="string")throw Object.assign(new Error("Invalid product"),{status:400});
 const client=db();
 const {data:product,error}=await client.from("commerce_products").select("id,name,category,price_cents,currency,published,asset_path,stock_qty").eq("id",product_id).single();
 if(error||!product||!product.published)throw Object.assign(new Error("Product unavailable"),{status:404});
 if(product.category==="membresia")throw Object.assign(new Error("Recurring billing is not enabled yet"),{status:409});
 if(product.category==="digital" && !product.asset_path)throw Object.assign(new Error("Digital resource not yet uploaded"),{status:409});
 if(product.category==="curso" && !product.asset_path){const {count,error:lessonError}=await client.from("commerce_lessons").select("id",{count:"exact",head:true}).eq("product_id",product.id);if(lessonError)throw lessonError;if(!count)throw Object.assign(new Error("Course has no lessons"),{status:409});}
 if(product.category==="fisico"&&product.stock_qty<1)throw Object.assign(new Error("Out of stock"),{status:409});
 const {data:order,error:insertError}=await client.from("commerce_orders").insert({buyer_id:user.id,product_id:product.id,status:"pending",amount_cents:product.price_cents,currency:product.currency}).select("id").single();
 if(insertError)throw insertError;
 const origin=process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
 const paypalOrder=await paypal("/v2/checkout/orders","POST",{intent:"CAPTURE",purchase_units:[{reference_id:order.id,description:product.name,amount:{currency_code:product.currency,value:(product.price_cents/100).toFixed(2)}}],application_context:{return_url:origin+"/?checkout=return",cancel_url:origin+"/?checkout=cancel",brand_name:"Angel Beriguete",user_action:"PAY_NOW"}},order.id);
 const {error:updateError}=await client.from("commerce_orders").update({paypal_order_id:paypalOrder.id}).eq("id",order.id);
 if(updateError)throw updateError;
 const approve=paypalOrder.links?.find(x=>x.rel==="approve"||x.rel==="payer-action")?.href;
 if(!approve)throw new Error("PayPal did not return an approval URL");
 return Response.json({approve_url:approve,order_id:order.id});
 }catch(e){return failure(e);}
}
