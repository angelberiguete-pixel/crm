import {db,viewer,isAdmin,failure} from "../../../../../lib/server";
export const dynamic="force-dynamic";
export async function POST(request){
 try{
 const u=await viewer(request);if(!await isAdmin(u.id))throw Object.assign(new Error("Forbidden"),{status:403});
 const {content_type}=await request.json();
 const extension=content_type==="application/pdf"?"pdf":content_type==="video/mp4"?"mp4":null;
 if(!extension)throw Object.assign(new Error("Only PDF and MP4 are supported"),{status:400});
 const path="assets/"+crypto.randomUUID()+"."+extension;
 const {data,error}=await db().storage.from("commerce-private").createSignedUploadUrl(path,{upsert:false});
 if(error)throw error;
 return Response.json({path,token:data.token,max_bytes:52428800});
 }catch(e){return failure(e);}
}
