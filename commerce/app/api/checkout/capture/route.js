import {db,viewer,paypal,extractCapture,fulfill,failure} from "../../../../lib/server";
export const dynamic="force-dynamic";
export async function POST(request){
 try{
 const user=await viewer(request);
 const {paypal_order_id}=await request.json();
 if(typeof paypal_order_id!=="string"||paypal_order_id.length>100)throw Object.assign(new Error("Invalid order"),{status:400});
 const client=db();
 const {data:order,error}=await client.from("commerce_orders").select("*").eq("paypal_order_id",paypal_order_id).eq("buyer_id",user.id).single();
 if(error||!order)throw Object.assign(new Error("Order not found"),{status:404});
 if(order.status==="paid")return Response.json({status:"paid",order_id:order.id});
 const result=await paypal("/v2/checkout/orders/"+encodeURIComponent(paypal_order_id)+"/capture","POST",{},order.id+"-capture");
 const capture=extractCapture(result);
 if(!capture) return Response.json({status:"pending",message:"Payment not yet completed"},{status:202});
 await fulfill(order,capture);
 return Response.json({status:"paid",order_id:order.id});
 }catch(e){return failure(e);}
}
