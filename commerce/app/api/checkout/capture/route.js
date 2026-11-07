import {db,paypal,extractCapture,fulfill,matchGuest,failure} from "../../../../lib/server";
export const dynamic="force-dynamic";
export async function POST(request){
 try{
  const origin=request.headers.get("origin");
  if(origin && origin!==new URL(request.url).origin)throw Object.assign(new Error("Invalid origin"),{status:403});
  const {paypal_order_id}=await request.json();
  if(typeof paypal_order_id!=="string"||!/^[-_A-Za-z0-9]{6,100}$/.test(paypal_order_id))
   throw Object.assign(new Error("Referencia no válida"),{status:400});
  const admin=db();
  const {data:order,error}=await admin.from("commerce_orders").select("*").eq("paypal_order_id",paypal_order_id).single();
  if(error||!order||!matchGuest(request,order))throw Object.assign(new Error("Pedido no autorizado"),{status:403});
  if(order.status==="refunded"||order.status==="cancelled")throw Object.assign(new Error("El pedido ya no está activo"),{status:409});
  if(order.status==="paid")return Response.json({status:"paid",order_id:order.id},{headers:{"Cache-Control":"no-store"}});
  const captured=await paypal("/v2/checkout/orders/"+encodeURIComponent(paypal_order_id)+"/capture","POST",{},order.id+"-capture");
  const capture=extractCapture(captured);
  if(!capture)return Response.json({status:"pending",message:"El pago todavía no se ha completado"},{status:202});
  await fulfill(order,capture);
  return Response.json({status:"paid",order_id:order.id},{headers:{"Cache-Control":"no-store"}});
 }catch(error){return failure(error);}
}
