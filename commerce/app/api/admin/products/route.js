import {db,viewer,isAdmin,failure} from "../../../../lib/server";
export const dynamic="force-dynamic";
async function guard(request){const u=await viewer(request);if(!await isAdmin(u.id))throw Object.assign(new Error("Forbidden"),{status:403});return u;}
export async function GET(request){try{await guard(request);const {data,error}=await db().from("commerce_products").select("*").order("created_at",{ascending:false});if(error)throw error;return Response.json({products:data});}catch(e){return failure(e);}}
export async function POST(request){
 try{
 const user=await guard(request);const input=await request.json();
 const category=String(input.category||"");const currency=String(input.currency||"USD");
 const price=Number(input.price_cents);
 if(!["servicio","digital","curso","fisico","membresia"].includes(category)||!["USD","EUR"].includes(currency)||!Number.isInteger(price)||price<100||price>200000000)throw Object.assign(new Error("Invalid product settings"),{status:400});
 const name=String(input.name||"").trim().slice(0,160);const desc=String(input.description||"").trim().slice(0,1200);
 if(name.length<3)throw Object.assign(new Error("Name too short"),{status:400});
 const published=false; // Always create drafts; publishing requires separate validation.
 const slug=(String(input.slug||name).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")).slice(0,140);
 const {data,error}=await db().from("commerce_products").insert({slug,name,description:desc,category,currency,price_cents:price,published,asset_path:input.asset_path?String(input.asset_path):null,stock_qty:Number.isInteger(input.stock_qty)?input.stock_qty:0,created_by:user.id}).select().single();
 if(error)throw error;return Response.json({product:data},{status:201});
 }catch(e){return failure(e);}
}
