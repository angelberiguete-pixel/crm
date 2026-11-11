import {NextRequest,NextResponse} from "next/server";
import {lookupOffer} from "../../../../../lib/payments/catalog";
import {paypalRequest} from "../../../../../lib/payments/paypal";
export const runtime="nodejs";
export async function POST(req:NextRequest){
 try {
  const input=await req.json();
  const offer=lookupOffer(input?.productId,input?.currency);
  if(!offer)return NextResponse.json({error:"Invalid offer"},{status:400});
  const order=await paypalRequest("/v2/checkout/orders","POST",{intent:"CAPTURE",purchase_units:[{description:offer.name,amount:{currency_code:offer.currency,value:offer.amount}}]});
  return NextResponse.json({id:order.id});
 }catch{return NextResponse.json({error:"Unable to create PayPal order"},{status:502});}
}
