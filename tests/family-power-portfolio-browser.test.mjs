// Playwright fixture test: only mocked Supabase traffic, no real customer actions.
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {chromium} from "playwright";

const base=process.env.CRM_BROWSER_TEST_BASE_URL||"http://127.0.0.1:3207";
const server=process.env.CRM_BROWSER_TEST_BASE_URL?null:spawn(process.execPath,
  ["node_modules/next/dist/bin/next","start","-p","3207","-H","127.0.0.1"],
  {stdio:["ignore","ignore","inherit"]});
let browser;
try{
 let ready=false;
 for(let i=0;i<60;i++){
  try{ready=(await fetch(base+"/login",{signal:AbortSignal.timeout(1000)})).ok;if(ready)break;}catch{}
  await new Promise(r=>setTimeout(r,500));
 }
 assert.ok(ready,"CRM test server must be reachable");
 browser=await chromium.launch({headless:true,channel:"chromium"});
 const fp="c1f2433e-e241-4771-a522-cdd5803e16d6";
 const own="a2f3cdb1-e4ec-4002-b9d4-a7867d733a1f";
 const user={id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",email:"qa-owner@example.invalid",
  aud:"authenticated",role:"authenticated",app_metadata:{},user_metadata:{},created_at:new Date().toISOString()};
 const token=[Buffer.from("{}").toString("base64url"),
  Buffer.from(JSON.stringify({sub:user.id,role:"authenticated",exp:Math.floor(Date.now()/1000)+3600})).toString("base64url"),
  "test-signature"].join(".");
 const context=await browser.newContext({viewport:{width:1280,height:850}});
 await context.addInitScript(({user,token})=>{
  localStorage.setItem("sb-ygipjqgyreeahslzorik-auth-token",JSON.stringify({
   access_token:token,refresh_token:"fake",expires_at:Math.floor(Date.now()/1000)+3600,
   expires_in:3600,token_type:"bearer",user
  }));
 },{user,token});
 const visits=[],tenants=[
  {tenant_id:fp,tenant_name:"Family Power",tenant_slug:"family-power",member_count:1,plan_code:"starter"},
  {tenant_id:own,tenant_name:"Operación agencia",tenant_slug:"eurevector",member_count:1,plan_code:"starter"}
 ];
 const analytics=id=>({tenant_id:id,calculated_at:new Date().toISOString(),branding:{
   brand_name:id===fp?"Family Power":"Operación agencia",
   logo_url:id===fp?"/client-brands/family-power/logo-negativo-sin-fondo.svg":null,
   primary_color:id===fp?"#C91425":"#2563eb"},
   counts:{contacts:0,crm_companies:0,conversations:0,assigned_conversations:0,unassigned_conversations:0,
     inbound_messages:0,human_reply_messages:0,quotations:0,opportunities:0,orders:0},
   quotations_by_currency:[],opportunities_by_currency:[],sellers:[],channel_status:[],
   invoices:{state:"not_integrated",reason:"qa"},meta_pixel:{state:"not_integrated",reason:"qa"}});
 let allowed=true;
 await context.route("https://ygipjqgyreeahslzorik.supabase.co/**",async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname.split("/").pop();
  let data=[];
  if(path==="user")data=user;
  else if(path==="platform_current_access")data={is_platform_admin:allowed};
  else if(path==="platform_admin_tenants")data=tenants;
  else if(path==="platform_admin_tenant_analytics")data=analytics(req.postDataJSON().p_tenant_id);
  else if(path==="platform_admin_members")data=[];
  else if(path==="platform_join_tenant_as_admin"){
   visits.push(req.postDataJSON().p_tenant_id);
   data={tenant_id:fp,role:"admin",client_view_locked:true};
  }else if(path==="list_my_tenants")data=tenants.map(t=>({
    ...t,membership_role:"admin",is_active:t.tenant_id===fp
  }));
  else if(path==="tenant_current_permissions")data={all:true};
  else if(path==="tenant_effective_modules")data=[{module_key:"dashboard",enabled:true}];
  else if(path==="tenant_settings")data=[];
  else if(path==="crm_member_session_heartbeat")data={active_seconds:0};
  await route.fulfill({status:200,contentType:"application/json",
   headers:{"access-control-allow-origin":"*","content-range":"0-0/1"},body:JSON.stringify(data)});
 });
 const page=await context.newPage();
 await page.goto(base+"/mis-empresas");
 await page.getByRole("heading",{name:"Mis empresas"}).waitFor({timeout:15000});
 const tile=page.getByRole("button",{name:"Entrar como administrador en Family Power"});
 await tile.waitFor();
 const logo=tile.locator('img[alt="Logo de Family Power"]');
 await logo.waitFor({state:"attached"});
 assert.match(await logo.getAttribute("src")??"",/client-brands\/family-power\/logo-negativo-sin-fondo\.svg/,
   "Family Power must load only its own official logo in the portfolio");
 await tile.click();
 await page.waitForURL(url=>url.pathname==="/crm",{timeout:15000});
 assert.deepEqual(visits,[fp],"one click opens Family Power through audited RPC, not the agency");
 // The whole portfolio is denied when the session has no platform privilege.
 allowed=false;
 const denied=await context.newPage();
 await denied.goto(base+"/mis-empresas");
 await denied.getByRole("heading",{name:"Acceso de propietario requerido"}).waitFor({timeout:15000});
 assert.equal(await denied.getByRole("button",{name:"Entrar como administrador en Family Power"}).count(),0);
 console.log("PASS: direct tenant-specific support entry, branded card and platform authorization denial (mocked API).");
 await context.close();
}finally{
 if(browser)await browser.close();
 if(server)server.kill("SIGTERM");
}
