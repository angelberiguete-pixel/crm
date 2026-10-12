// This browser regression uses controlled Supabase API responses; it is NOT a real Meta connection.
// PostgreSQL authorization and A/B cross-company restrictions are checked separately.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
const base=process.env.CRM_BROWSER_TEST_BASE_URL||"http://127.0.0.1:3169";
const server=process.env.CRM_BROWSER_TEST_BASE_URL?null:spawn(process.execPath,["node_modules/next/dist/bin/next","start","-p","3169","-H","127.0.0.1"],{stdio:["ignore","ignore","inherit"]});
let browser;
try{
 let ready=false;for(let i=0;i<60;i++){try{ready=(await fetch(base+"/login",{signal:AbortSignal.timeout(1000)})).ok;if(ready)break}catch{}await new Promise(r=>setTimeout(r,500));}
 assert.ok(ready,"test web server ready");
 browser=await chromium.launch({headless:true,...(process.env.CRM_TEST_CHROMIUM_PATH?{executablePath:process.env.CRM_TEST_CHROMIUM_PATH,args:["--no-sandbox","--disable-dev-shm-usage"]}:{channel:"chromium"})});
 const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const tenant="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
 const seller="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
 const owner="11111111-1111-4111-8111-111111111111";
 const channel="cccccccc-cccc-4ccc-8ccc-cccccccccccc";
 const conversation="dddddddd-dddd-4ddd-8ddd-dddddddddddd";
 const user={id:owner,aud:"authenticated",role:"authenticated",email:"owner@example.invalid",app_metadata:{},user_metadata:{},created_at:new Date().toISOString()};
 const token=[Buffer.from("{}").toString("base64url"),Buffer.from(JSON.stringify({sub:owner,role:"authenticated",exp:Math.floor(Date.now()/1000)+3600})).toString("base64url"),"test-signature"].join(".");
 await ctx.addInitScript(({user,token})=>localStorage.setItem("sb-ygipjqgyreeahslzorik-auth-token",JSON.stringify({access_token:token,refresh_token:"mock",expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:"bearer",user})),{user,token});
 let assignee=null,assignmentCalls=0;
 await ctx.route("https://ygipjqgyreeahslzorik.supabase.co/**",async route=>{
  const req=route.request(),url=new URL(req.url());let data=[];
  if(url.pathname.endsWith("/list_my_tenants"))data=[{tenant_id:tenant,tenant_name:"Tienda QA",tenant_slug:"qa-inbox",membership_role:"owner",is_active:true}];
  else if(url.pathname.endsWith("/tenant_current_permissions"))data={all:true};
  else if(url.pathname.endsWith("/tenant_effective_modules"))data=[{module_key:"inbox",enabled:true}];
  else if(url.pathname.endsWith("/tenant_inbox_assignees"))data=[{user_id:owner,display_name:"Propietario QA",team_role:"Propietario"},{user_id:seller,display_name:"Vendedora QA",team_role:"Vendedor"}];
  else if(url.pathname.endsWith("/tenant_assign_conversation")){
    const input=req.postDataJSON();assignmentCalls++;
    assert.equal(input.p_tenant_id,tenant,"assignment scoped to active tenant");
    assert.equal(input.p_conversation_id,conversation);
    assignee=input.p_assignee;data={conversation_id:conversation,tenant_id:tenant,assigned_to:assignee,changed:true};
  }
  else if(url.pathname.endsWith("/channels"))data=[{id:channel,provider:"whatsapp",name:"Línea de prueba",status:"disconnected"}];
  else if(url.pathname.endsWith("/conversations"))data=[{id:conversation,channel_id:channel,contact_id:null,opportunity_id:null,subject:"Consulta de prueba",status:"open",priority:"normal",assigned_to:assignee,unread_count:1,last_message_at:null,metadata:{}}];
  else if(url.pathname.endsWith("/user"))data=user;
  else if(url.pathname.endsWith("/contacts")||url.pathname.endsWith("/companies")||url.pathname.endsWith("/opportunities")||url.pathname.endsWith("/messages"))data=[];
  else if(url.pathname.endsWith("/platform_current_access"))data={is_platform_admin:false};
  await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(data),headers:{"access-control-allow-origin":"*"}});
 });
 const page=await ctx.newPage();
 await page.goto(base+"/crm/inbox");
 await page.getByRole("heading",{name:"Conversaciones"}).waitFor();
 await page.getByText("WhatsApp: Sin conexión activa").waitFor();
 await page.getByRole("button",{name:/Consulta de prueba/}).waitFor();
 await page.getByRole("button",{name:/Consulta de prueba/}).click();
 assert.ok(await page.getByText(/Las respuestas externas seguirán desactivadas/).isVisible(),"no mock message sending offered");
 await page.getByRole("button",{name:"Volver a las conversaciones"}).click();
 await page.getByRole("combobox",{name:"Filtrar conversaciones por responsable"}).selectOption("unassigned");
 await page.getByRole("button",{name:/Consulta de prueba/}).waitFor();
 await page.getByRole("combobox",{name:"Filtrar conversaciones por canal"}).selectOption("instagram");
 await page.getByText("Sin conversaciones").waitFor();
 await page.getByRole("combobox",{name:"Filtrar conversaciones por canal"}).selectOption("whatsapp");
 await page.getByRole("button",{name:/Consulta de prueba/}).click();
 await page.getByRole("combobox",{name:"Asignar conversación a vendedor"}).selectOption(seller);
 await page.getByRole("button",{name:"Volver a las conversaciones"}).click();
 await page.getByRole("combobox",{name:"Filtrar conversaciones por responsable"}).selectOption("all");
 await page.getByText("Responsable: Vendedora QA").waitFor();
 assert.equal(assignmentCalls,1,"supervisor assigns once");
 await page.getByRole("combobox",{name:"Filtrar conversaciones por responsable"}).selectOption("unassigned");
 await page.getByText("Sin conversaciones").waitFor();
 await page.getByRole("combobox",{name:"Filtrar conversaciones por responsable"}).selectOption("all");
 await page.getByRole("button",{name:/Consulta de prueba/}).click();
 await page.getByRole("combobox",{name:"Asignar conversación a vendedor"}).selectOption("");
 await page.getByRole("button",{name:"Volver a las conversaciones"}).click();
 await page.getByText("Responsable: Sin asignar").waitFor();
 assert.equal(assignmentCalls,2,"supervisor can release");
 const dimensions=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,viewport:innerWidth}));
 assert.ok(dimensions.scroll<=dimensions.viewport+1,"conversation UI cannot scroll horizontally on 390px mobile");
 console.log("PASS mobile 390px: Spanish channel status, provider and assignee filters, assign/release, and no fake sending (controlled API).");
}finally{if(browser)await browser.close();if(server)server.kill();}
