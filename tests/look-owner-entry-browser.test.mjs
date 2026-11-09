// Contract: LOOK public CTA opens platform portfolio even when Family Power was
// the previous active tenant. Fake sessions only; never uses real credentials.
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {chromium} from "playwright";

const base=process.env.CRM_BROWSER_TEST_BASE_URL||"http://127.0.0.1:3205";
const server=process.env.CRM_BROWSER_TEST_BASE_URL?null:spawn(process.execPath,
  ["node_modules/next/dist/bin/next","start","-p","3205","-H","127.0.0.1"],
  {stdio:["ignore","ignore","inherit"]});
let browser;
const family="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const look="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const user={id:"11111111-1111-4111-8111-111111111111",
  aud:"authenticated",role:"authenticated",email:"qa@example.invalid",
  app_metadata:{},user_metadata:{},created_at:new Date().toISOString()};
const exp=Math.floor(Date.now()/1000)+3600;
const token=[Buffer.from("{}").toString("base64url"),
  Buffer.from(JSON.stringify({sub:user.id,role:"authenticated",exp})).toString("base64url"),"fixture"].join(".");
const tenants=[
  {tenant_id:family,tenant_name:"Family Power",tenant_slug:"family-power",member_count:1,plan_code:"starter"},
  {tenant_id:look,tenant_name:"Empresia",tenant_slug:"eurevector",member_count:1,plan_code:"starter"},
];

async function prepare(role){
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 let activeId=family;
 const calls={join:[],setActive:0,platform:0};
 if(role!=="guest"){
  await context.addInitScript(({user,token,exp})=>{
   localStorage.setItem("sb-ygipjqgyreeahslzorik-auth-token",JSON.stringify({
    access_token:token,refresh_token:"qa-refresh",expires_at:exp,expires_in:3600,
    token_type:"bearer",user,
   }));
   sessionStorage.setItem("crm:login-intent","family-power"); // intentionally stale
  },{user,token,exp});
 }
 await context.route("https://ygipjqgyreeahslzorik.supabase.co/**",async route=>{
  const request=route.request(),url=new URL(request.url()),name=url.pathname.split("/").pop();
  let body=[];
  if(name==="user")body=user;
  else if(name==="platform_current_access"){calls.platform++;body={is_platform_admin:role==="owner"};}
  else if(name==="platform_admin_tenants")body=tenants;
  else if(name==="platform_admin_tenant_analytics"){
   const id=request.postDataJSON().p_tenant_id;
   body={tenant_id:id,calculated_at:new Date().toISOString(),branding:null,
    counts:{contacts:0,crm_companies:0,conversations:0,assigned_conversations:0,
      unassigned_conversations:0,inbound_messages:0,human_reply_messages:0,
      quotations:0,opportunities:0,orders:0},
    quotations_by_currency:[],opportunities_by_currency:[],sellers:[],channel_status:[],
    invoices:{state:"not_configured",reason:"not enabled"},
    meta_pixel:{state:"not_configured",reason:"not enabled"}};
  }
  else if(name==="platform_admin_members")body=[];
  else if(name==="platform_join_tenant_as_admin"){
   activeId=request.postDataJSON().p_tenant_id;
   calls.join.push(activeId);
   body={tenant_id:activeId,role:"admin"};
  }
  else if(name==="list_my_tenants")body=tenants.map(t=>({...t,membership_role:"admin",is_active:t.tenant_id===activeId}));
  else if(name==="set_active_tenant"){calls.setActive++;activeId=request.postDataJSON().p_tenant_id;body={tenant_id:activeId};}
  else if(name==="tenant_current_permissions")body={all:true};
  else if(name==="tenant_effective_modules")body=[{module_key:"dashboard",enabled:true},{module_key:"companies",enabled:true}];
  else if(name==="tenant_settings")body=[];
  else if(name==="logout")body=null;
  await route.fulfill({status:name==="logout"?204:200,contentType:"application/json",
   body:body===null?"":JSON.stringify(body),headers:{"access-control-allow-origin":"*"}});
 });
 return {context,calls};
}

try{
 let ready=false;
 for(let i=0;i<60;i++){
  try{ready=(await fetch(base+"/acceso-crm",{signal:AbortSignal.timeout(1000)})).ok;if(ready)break;}
  catch{}
  await new Promise(resolve=>setTimeout(resolve,500));
 }
 assert.ok(ready,"Empresia access gateway available");
 browser=await chromium.launch({headless:true,
  ...(process.env.CRM_TEST_CHROMIUM_PATH?
   {executablePath:process.env.CRM_TEST_CHROMIUM_PATH,args:["--no-sandbox","--disable-dev-shm-usage"]}:{channel:"chromium"})});

 const owner=await prepare("owner");
 const page=await owner.context.newPage();
 await page.goto(base+"/empresia");
 await page.getByRole("link",{name:"Acceso CRM",exact:true}).click();
 await page.waitForURL(url=>url.pathname==="/mis-empresas",{timeout:20000});
 await page.getByRole("heading",{name:"Mis empresas",exact:true}).waitFor();
 const cards=page.locator('button[aria-label^="Entrar como administrador en "]');
 await cards.first().waitFor();
 assert.match((await cards.first().getAttribute("aria-label"))||"",/Empresia/,
  "the global owner sees Empresia first despite previously selected Family Power");
 assert.equal(owner.calls.join.length,0,"landing alone must never join Family Power");
 assert.equal(owner.calls.setActive,0,"landing alone must never change selected client");
 assert.ok(owner.calls.platform>=1,"platform authority must be checked");
 assert.equal(await page.evaluate(()=>sessionStorage.getItem("crm:login-intent")),null,
  "Empresia public entry clears stale Family Power login intent");
 await cards.first().click();
 await page.waitForURL(url=>url.pathname==="/crm",{timeout:20000});
 assert.deepEqual(owner.calls.join,[look],"Empresia card joins only the platform-owned tenant");
 await owner.context.close();

 const signedIn=await prepare("owner");
 const login=await signedIn.context.newPage();
 await login.goto(base+"/login");
 await login.waitForURL(url=>url.pathname==="/mis-empresas",{timeout:20000});
 assert.equal(signedIn.calls.setActive,0,"owner login must not activate prior customer tenant");
 await signedIn.context.close();

 const ordinary=await prepare("member");
 const worker=await ordinary.context.newPage();
 await worker.goto(base+"/acceso-crm");
 await worker.waitForURL(url=>url.pathname==="/crm",{timeout:20000});
 assert.equal(ordinary.calls.join.length,0,"ordinary member cannot use platform join");
 await ordinary.context.close();

 const guest=await prepare("guest");
 const unauthenticated=await guest.context.newPage();
 await unauthenticated.goto(base+"/acceso-crm");
 await unauthenticated.waitForURL(url=>url.pathname==="/login",{timeout:20000});
 await unauthenticated.getByRole("img",{name:"Empresia"}).waitFor();
 assert.notEqual(new URL(unauthenticated.url()).pathname,"/family-power/login");
 await guest.context.close();

 console.log("PASS: Empresia landing and login open owner portfolio despite stale Family Power; explicit platform card joins the correct tenant; members and guests remain authorized.");
}finally{
 if(browser)await browser.close();
 if(server)server.kill("SIGTERM");
}
