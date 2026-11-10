import {createClient} from "@supabase/supabase-js";
import {NextRequest,NextResponse} from "next/server";

export const runtime="nodejs";
export const dynamic="force-dynamic";

const PHOTOS=[
 {filename:"1000080152.jpg",url:"https://drive.google.com/file/d/1zWQ3ITYJA22Wel2RjDnTxwnxvmSmDwB7/view?usp=drivesdk"},
 {filename:"1000080149.jpg",url:"https://drive.google.com/file/d/1z_xgyPOPcgwMlvt5ypODQTys73gDT6HT/view?usp=drivesdk"},
 {filename:"1000080129.jpg",url:"https://drive.google.com/file/d/1PAYBnNVWgI9jaFL2mBbcw-71qms3yWsg/view?usp=drivesdk"},
 {filename:"1000080108.jpg",url:"https://drive.google.com/file/d/10d3ned7fvjD-KJ9Vxl9V58HgxfUeRl3c/view?usp=drivesdk"},
 {filename:"1000080107.jpg",url:"https://drive.google.com/file/d/1GaTy8TeOExFWNjK2mBHU1qMVophBPvRk/view?usp=drivesdk"}
];
const DOCUMENTS=[
 {filename:"Family Power - INDUETRONIC 1.5kW 12V - Ficha Diseno Original Foto Fondo Blanco - V4 Revision.pdf",
  url:"https://drive.google.com/file/d/1l4ZhUawgK9YCx7dk-lP5f7fSa2gvY4ac/view?usp=drivesdk",
  status:"V4 - borrador para revisión, pendiente de comprobar contra placa y manual"},
 {filename:"FamilyPower_INDUETRONIC_1-5kW_12V_V2_Fondo_Blanco.pdf",
  url:"https://drive.google.com/file/d/1_FieR9-H0XVxplrfs1roE-nNGOLgRIxr/view?usp=drivesdk",
  status:"V2 - versión anterior conservada como referencia"}
];
const fail=(status:number)=>NextResponse.json({error:"No se pudo validar el acceso a la biblioteca privada."},
 {status,headers:{"Cache-Control":"private, no-store"}});
export async function GET(request:NextRequest){
 const header=request.headers.get("authorization")??"";
 if(!/^Bearer [A-Za-z0-9._~+/=-]+$/.test(header)||header.length>4096)return fail(401);
 const token=header.slice(7);
 // Same canonical *publishable* public credentials as the browser CRM. Never a service key.
 const url="https://ygipjqgyreeahslzorik.supabase.co",anon="sb_publishable_2Q7aF-M61t2OZWRrt-vebQ_t_oNK_u7";
 try{
  const supabase=createClient(url,anon,{
    global:{headers:{Authorization:"Bearer "+token}},
    auth:{persistSession:false,autoRefreshToken:false}
  });
  const [{data:userInfo,error:authError},access]=await Promise.all([
    supabase.auth.getUser(token),supabase.rpc("list_my_tenants")
  ]);
  if(authError||!userInfo.user||access.error)return fail(403);
  const allowed=Array.isArray(access.data)&&access.data.some((item:unknown)=>{
    if(!item||typeof item!=="object")return false;
    const tenant=item as Record<string,unknown>;
    return tenant.tenant_slug==="family-power"&&["owner","admin"].includes(String(tenant.membership_role??""));
  });
  if(!allowed)return fail(403);
  return NextResponse.json({
    photos:PHOTOS,
    documents:DOCUMENTS,
    publishedProducts:0,
    status:"Documentación original, NO inventario ni precio aprobado",
    isDrivePreview:true
  },{headers:{"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
 }catch{return fail(503);}
}
