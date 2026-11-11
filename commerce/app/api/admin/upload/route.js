import {db,viewer,isAdmin,failure} from "../../../../lib/server";
export const dynamic="force-dynamic";
export async function POST(request){
 try{
 const user=await viewer(request);
 if(!await isAdmin(user.id))throw Object.assign(new Error("Forbidden"),{status:403});
 const form=await request.formData();const file=form.get("file");
 if(!file||typeof file==="string"||file.type!=="application/pdf"||file.size>3_000_000)throw Object.assign(new Error("PDF required (max 3 MB)"),{status:400});
 const path="assets/"+crypto.randomUUID()+".pdf";
 const {error}=await db().storage.from("commerce-private").upload(path,file,{contentType:"application/pdf",upsert:false});
 if(error)throw error;
 return Response.json({asset_path:path});
 }catch(e){return failure(e);}
}
