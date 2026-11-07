import { db, viewer, failure } from "../../../lib/server";
export const dynamic="force-dynamic";
export async function GET(request){
 try{
 const user=await viewer(request);const admin=db();
 const {data,error}=await admin.from("commerce_entitlements").select("id,product_id,status,commerce_products(name,category,asset_path)").eq("buyer_id",user.id).eq("status","active");
 if(error)throw error;
 const items=await Promise.all((data||[]).map(async e=>{
 const p=e.commerce_products;let url=null;let lessons=[];
 if(p?.asset_path){const signed=await admin.storage.from("commerce-private").createSignedUrl(p.asset_path,1800);if(!signed.error)url=signed.data.signedUrl;}
 if(p?.category==="curso"){
 const {data:rows,error:lessonError}=await admin.from("commerce_lessons").select("id,title,position,asset_path").eq("product_id",e.product_id).order("position");
 if(lessonError)throw lessonError;
 lessons=await Promise.all((rows||[]).map(async lesson=>{
 const signed=await admin.storage.from("commerce-private").createSignedUrl(lesson.asset_path,1800);
 return {id:lesson.id,title:lesson.title,url:signed.error?null:signed.data.signedUrl,kind:lesson.asset_path.endsWith(".mp4")?"video":"pdf"};
 }));
 }
 return {id:e.id,name:p?.name,type:p?.category,download_url:url,lessons,expires_in:1800};
 }));
 return Response.json({items},{headers:{"Cache-Control":"private, no-store"}});
 }catch(e){return failure(e);}
}
