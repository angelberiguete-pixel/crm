import { db, viewer, failure } from "../../../lib/server";
export const dynamic="force-dynamic";
export async function GET(request){
 try{
 const user=await viewer(request);const admin=db();
 const {data,error}=await admin.from("commerce_entitlements").select("id,product_id,status,commerce_products(name,category,asset_path)").eq("buyer_id",user.id).eq("status","active");
 if(error)throw error;
 const items=await Promise.all((data||[]).map(async e=>{
 const p=e.commerce_products;let url=null;
 if(p?.asset_path){const signed=await admin.storage.from("commerce-private").createSignedUrl(p.asset_path,300);if(!signed.error)url=signed.data.signedUrl;}
 return {id:e.id,name:p?.name,type:p?.category,download_url:url,expires_in:300};
 }));
 return Response.json({items},{headers:{"Cache-Control":"private, no-store"}});
 }catch(e){return failure(e);}
}
