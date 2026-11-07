import {db,viewer,isAdmin,failure} from "../../../../../lib/server";
export const dynamic="force-dynamic";
export async function PATCH(request,{params}){
 try{
 const u=await viewer(request);if(!await isAdmin(u.id))throw Object.assign(new Error("Forbidden"),{status:403});
 const {id}=await params;const input=await request.json();const admin=db();
 const {data:existing,error}=await admin.from("commerce_products").select("*").eq("id",id).single();
 if(error||!existing)throw Object.assign(new Error("Product not found"),{status:404});
 const allowed=["name","description","price_cents","asset_path","cover_url","stock_qty","delivery_note","published"];
 const changes={};for(const key of allowed)if(Object.prototype.hasOwnProperty.call(input,key))changes[key]=input[key];
 if(changes.name!==undefined){changes.name=String(changes.name).trim().slice(0,160);if(changes.name.length<3)throw Object.assign(new Error("Invalid name"),{status:400});}
 if(changes.description!==undefined)changes.description=String(changes.description).slice(0,1200);
 if(changes.price_cents!==undefined && (!Number.isInteger(changes.price_cents)||changes.price_cents<100||changes.price_cents>200000000))throw Object.assign(new Error("Invalid price"),{status:400});
 if(changes.stock_qty!==undefined && (!Number.isInteger(changes.stock_qty)||changes.stock_qty<0))throw Object.assign(new Error("Invalid stock"),{status:400});
 if(changes.asset_path!==undefined&&changes.asset_path!==null&&!/^assets\/[a-zA-Z0-9-]+\.(pdf|mp4)$/.test(changes.asset_path))throw Object.assign(new Error("Invalid storage path"),{status:400});
 if(changes.published===true){
 if(existing.category==="membresia")throw Object.assign(new Error("Recurring billing is not enabled"),{status:409});
 if(existing.category==="fisico")throw Object.assign(new Error("Shipping flow is not enabled"),{status:409});
 if(existing.category==="digital"&&!((changes.asset_path??existing.asset_path)))throw Object.assign(new Error("Upload a PDF before publishing"),{status:409});
 if(existing.category==="curso"&&!((changes.asset_path??existing.asset_path))){
 const {count,error:e}=await admin.from("commerce_lessons").select("id",{count:"exact",head:true}).eq("product_id",id);if(e)throw e;
 if(!count)throw Object.assign(new Error("Add at least one lesson before publishing"),{status:409});
 }
 }
 const {data,error:updateError}=await admin.from("commerce_products").update(changes).eq("id",id).select().single();if(updateError)throw updateError;
 return Response.json({product:data});
 }catch(e){return failure(e);}
}
