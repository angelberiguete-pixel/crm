import {DEMO_PRODUCTS} from "../../../lib/catalog";
import {db,configured} from "../../../lib/server";
export const dynamic="force-dynamic";
export async function GET(){
 if(!configured()) return Response.json({products:DEMO_PRODUCTS,ready:false,mode:"demo"});
 const {data,error}=await db().from("commerce_products").select("id,name,category,description,price_cents,currency,cover_url,published,delivery_note").eq("published",true).order("created_at",{ascending:false});
 if(error) return Response.json({error:"Catalog temporarily unavailable"},{status:503});
 return Response.json({products:(data||[]).map(p=>({...p,price:p.price_cents/100,delivery:p.delivery_note})),ready:Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET && process.env.PAYPAL_WEBHOOK_ID),mode:"connected"});
}
