import { createClient } from "@supabase/supabase-js";

const ALLOWED_ORIGINS = new Set([
  "https://crm-revenue-os.vercel.app",
  "http://localhost:3000"
]);

const headers=(origin:string)=>({
  "Content-Type":"application/json; charset=utf-8",
  "Access-Control-Allow-Origin":origin,
  "Access-Control-Allow-Headers":"authorization, content-type, x-client-info, apikey",
  "Access-Control-Allow-Methods":"POST, OPTIONS",
  "Vary":"Origin"
});

const emailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.serve(async(req)=>{
  const origin=req.headers.get("origin")??"";
  const allowed=ALLOWED_ORIGINS.has(origin);
  if(req.method==="OPTIONS") return allowed?new Response("ok",{headers:headers(origin)}):new Response(null,{status:403});
  if(req.method!=="POST") return new Response(JSON.stringify({ok:false,error:"method_not_allowed"}),{status:405,headers:headers(allowed?origin:"https://crm-revenue-os.vercel.app")});
  if(!allowed) return new Response(JSON.stringify({ok:false,error:"origin_not_allowed"}),{status:403,headers:{"Content-Type":"application/json"}});
  const authorization=req.headers.get("authorization");
  if(!authorization) return new Response(JSON.stringify({ok:false,error:"authentication_required"}),{status:401,headers:headers(origin)});

  try{
    const body=await req.json();
    const tenantId=String(body.tenant_id??"").trim();
    const email=String(body.email??"").trim().toLowerCase();
    const roleKey=String(body.role_key??"").trim();

    if(!uuidPattern.test(tenantId)) throw new Error("tenant_invalid");
    if(!emailPattern.test(email)||email.length>180) throw new Error("email_invalid");
    if(!roleKey||roleKey.length>80) throw new Error("role_invalid");

    const url=Deno.env.get("SUPABASE_URL")!;
    const anonKey=Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient=createClient(url,anonKey,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
    const service=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});

    const access=await userClient.rpc("platform_current_access");
    if(access.error||!(access.data as any)?.is_platform_admin) return new Response(JSON.stringify({ok:false,error:"platform_admin_required"}),{status:403,headers:headers(origin)});

    const [roleResult,membersResult]=await Promise.all([
      userClient.rpc("platform_admin_tenant_roles",{p_tenant_id:tenantId}),
      userClient.rpc("platform_admin_members",{p_tenant_id:tenantId})
    ]);
    if(roleResult.error) throw new Error("role_lookup_failed");
    if(membersResult.error) throw new Error("member_lookup_failed");

    const roles=(roleResult.data??[]) as Array<{role_key:string}>;
    if(!roles.some(r=>r.role_key===roleKey)) throw new Error("role_not_available");

    const members=(membersResult.data??[]) as Array<{email:string|null;membership_status:string}>;
    const currentMember=members.find(m=>(m.email??"").toLowerCase()===email);
    if(currentMember?.membership_status==="active"){
      return new Response(JSON.stringify({ok:false,error:"already_member",message:"Ese usuario ya es miembro activo de este cliente."}),{status:409,headers:headers(origin)});
    }

    const listed=await service.auth.admin.listUsers({page:1,perPage:1000});
    if(listed.error) throw new Error("user_lookup_failed");
    let user=listed.data.users.find(u=>(u.email??"").toLowerCase()===email)??null;
    const redirectTo=Deno.env.get("LOOK_SOCIAL_INVITE_REDIRECT_URL")??"https://crm-revenue-os.vercel.app/accept-invite";
    let delivery:"invite"|"magic_link"="invite";

    if(!user){
      const invited=await service.auth.admin.inviteUserByEmail(email,{redirectTo,data:{invited_via:"look_social_media_crm"}});
      if(invited.error||!invited.data.user) throw new Error("invite_delivery_failed");
      user=invited.data.user;
    }else{
      delivery="magic_link";
      const publicClient=createClient(url,anonKey,{auth:{persistSession:false,autoRefreshToken:false}});
      const sent=await publicClient.auth.signInWithOtp({email,options:{shouldCreateUser:false,emailRedirectTo:redirectTo}});
      if(sent.error) throw new Error("invite_delivery_failed");
    }

    const membership=await userClient.rpc("platform_add_member",{
      p_tenant_id:tenantId,
      p_user_id:user.id,
      p_role_key:roleKey,
      p_status:"invited"
    });
    if(membership.error) throw new Error("membership_create_failed");

    return new Response(JSON.stringify({
      ok:true,
      email,
      role_key:roleKey,
      delivery,
      message:delivery==="invite"?"Invitación enviada.":"El usuario ya existía; se envió un enlace seguro de acceso."
    }),{status:200,headers:headers(origin)});
  }catch(error){
    console.error("platform-invite-user",error instanceof Error?error.message:"unknown_error");
    return new Response(JSON.stringify({ok:false,error:"request_failed",message:"No pudimos enviar la invitación. Revisa los datos e inténtalo de nuevo."}),{status:400,headers:headers(origin)});
  }
});