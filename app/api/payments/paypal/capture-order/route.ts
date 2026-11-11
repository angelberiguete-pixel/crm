import {NextRequest,NextResponse} from "next/server";
import {paypalRequest} from "../../../../../lib/payments/paypal";
export const runtime="nodejs";
export async function POST(req:NextRequest){
 try{
  const {orderId}=await req.json();
  if(typeof orderId!=="string"||!/^[A-Z0-9]{8,32}$/.test(orderId))return NextResponse.json({error:"Invalid order"},{status:400});
  // Capture is server-side. Fulfillment MUST wait for independently verified payment + persisted order.
  const result=await paypalRequest("/v2/checkout/orders/"+orderId+"/capture","POST",{},orderId);
  return NextResponse.json({id:result.id,status:result.status,fulfillment:"pending_verification"});
 }catch{return NextResponse.json({error:"Unable to capture order"},{status:502});}
}
