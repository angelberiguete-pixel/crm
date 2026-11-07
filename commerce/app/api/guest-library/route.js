import {db,matchGuest,failure} from "../../../lib/server";
export const dynamic="force-dynamic";
export async function GET(request){
 try{
  const paypalId=new URL(request.url).searchParams.get("paypal_order_id");
  if(!paypalId||!/^[-_A-Za-z0-9]{6,100}$/.test(paypalId))throw Object.assign(new Error("Referencia no válida"),{status:400});
  const admin=db();
  const {data:order,error}=await admin.from("commerce_orders").select("id,status,product_id,paypal_order_id,guest_token_hash").eq("paypal_order_id",paypalId).single();
  if(error||!order||!matchGuest(request,order))throw Object.assign(new Error("Pedido no autorizado"),{status:403});
  if(order.status!=="paid")throw Object.assign(new Error("El pago todavía no está confirmado"),{status:409});
  const {data:product,error:pe}=await admin.from("commerce_products").select("id,name,category,asset_path").eq("id",order.product_id).single();
  if(pe||!product)throw Object.assign(new Error("Recurso no encontrado"),{status:404});
  if(!["digital","curso"].includes(product.category))return Response.json({items:[]},{headers:{"Cache-Control":"private, no-store"}});
  let url=null,lessons=[];
  if(product.asset_path){
   const signed=await admin.storage.from("commerce-private").createSignedUrl(product.asset_path,900);
   if(!signed.error)url=signed.data.signedUrl;
  }
  if(product.category==="curso"){
   const {data:rows,error:le}=await admin.from("commerce_lessons").select("id,title,position,asset_path").eq("product_id",product.id).order("position");
   if(le)throw le;
   lessons=await Promise.all((rows||[]).map(async lesson=>{
    const signed=await admin.storage.from("commerce-private").createSignedUrl(lesson.asset_path,900);
    return {id:lesson.id,title:lesson.title,url:signed.error?null:signed.data.signedUrl};
   }));
  }
  return Response.json({items:[{name:product.name,download_url:url,lessons}]},{headers:{"Cache-Control":"private, no-store"}});
 }catch(error){return failure(error);}
}
