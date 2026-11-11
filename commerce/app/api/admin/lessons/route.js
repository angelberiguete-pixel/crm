import {db,viewer,isAdmin,failure} from "../../../../lib/server";
export const dynamic="force-dynamic";
export async function POST(request){
 try{
 const u=await viewer(request);if(!await isAdmin(u.id))throw Object.assign(new Error("Forbidden"),{status:403});
 const {product_id,title,position,asset_path}=await request.json();
 if(typeof product_id!=="string"||typeof title!=="string"||title.trim().length<3||!Number.isInteger(position)||!/^assets\/[a-zA-Z0-9-]+\.(pdf|mp4)$/.test(asset_path||""))throw Object.assign(new Error("Invalid lesson"),{status:400});
 const admin=db();const {data:product}=await admin.from("commerce_products").select("category").eq("id",product_id).maybeSingle();
 if(product?.category!=="curso")throw Object.assign(new Error("Course not found"),{status:404});
 const {data,error}=await admin.from("commerce_lessons").insert({product_id,title:title.slice(0,160),position,asset_path}).select().single();if(error)throw error;
 return Response.json({lesson:data},{status:201});
 }catch(e){return failure(e);}
}
