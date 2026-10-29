// Controlled, mobile QA: providers are NOT authorized, no external token or traffic.
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {chromium} from "playwright";
const base=process.env.CRM_BROWSER_TEST_BASE_URL||"http://127.0.0.1:3202";
const server=process.env.CRM_BROWSER_TEST_BASE_URL?null:spawn(process.execPath,
 ["node_modules/next/dist/bin/next","start","-p","3202","-H","127.0.0.1"],
 {stdio:["ignore","ignore","inherit"]});
let browser;
try{
 let ready=false;
 for(let i=0;i<60;i++){try{ready=(await fetch(base+"/login",{signal:AbortSignal.timeout(1000)})).ok;if(ready)break;}catch{}
 await new Promise(r=>setTimeout(r,500));}
 assert.ok(ready,"Next production-like test server");
 browser=await chromium.launch({headless:true,...(process.env.CRM_TEST_CHROMIUM_PATH?{executablePath:process.env.CRM_TEST_CHROMIUM_PATH,args:["--no-sandbox","--disable-dev-shm-usage"]}:{channel:"chromium"})});
 const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const A="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",B="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",uid="11111111-1111-4111-8111-111111111111";
 const user={id:uid,aud:"authenticated",role:"authenticated",email:"owner@example.invalid",app_metadata:{},user_metadata:{},created_at:new Date().toISOString()};
 const token=[Buffer.from("{}").toString("base64url"),Buffer.from(JSON.stringify({sub:uid,role:"authenticated",exp:Math.floor(Date.now()/1000)+3600})).toString("base64url"),"qa"].join(".");
 await ctx.addInitScript(({user,token})=>localStorage.setItem("sb-ygipjqgyreeahslzorik-auth-token",JSON.stringify({
   access_token:token,refresh_token:"qa",expires_at:Math.floor(Date.now()/1000)+3600,
   expires_in:3600,token_type:"bearer",user,
 })),{user,token});
 let active=A;const requests={A:[],B:[]};const writes=[];
 await ctx.route("https://ygipjqgyreeahslzorik.supabase.co/**",async route=>{
   const req=route.request(),url=new URL(req.url()),p=url.pathname,body=req.postDataJSON?.()??{};
   const tenant=body.p_tenant_id??active;
   let result=[];
   if(p.endsWith("/list_my_tenants"))result=[
     {tenant_id:A,tenant_name:"Empresa Uno",tenant_slug:"empresa-uno",membership_role:"owner",is_active:active===A},
     {tenant_id:B,tenant_name:"Empresa Dos",tenant_slug:"empresa-dos",membership_role:"owner",is_active:active===B}
   ];
   else if(p.endsWith("/set_active_tenant")){active=body.p_tenant_id;result={tenant_id:active};}
   else if(p.endsWith("/tenant_current_permissions"))result={all:true};
   else if(p.endsWith("/tenant_effective_modules"))result=[{module_key:"settings",enabled:true}];
   else if(p.endsWith("/tenant_integration_health"))result={
     tenant_id:tenant,whatsapp_verified_route:false,ai_spending_blocked:true,staff_profiles:0,channels:[]
   };
   else if(p.endsWith("/tenant_channel_requests_overview"))result=requests[tenant===A?"A":"B"].map((x,i)=>({
     channel_id:"cccccccc-cccc-4ccc-8ccc-"+String(i+1).padStart(12,"0"),
     provider:x.p_provider,display_name:x.p_channel_name,request_identifier:x.p_identifier,
     record_status:"disconnected",request_stage:"pending",requested_at:new Date().toISOString()
   }));
   else if(p.endsWith("/tenant_register_channel_request")){
     assert.equal(tenant,active,"request belongs exclusively to selected company");
     writes.push(body);
     requests[tenant===A?"A":"B"].push(body);
     result="cccccccc-cccc-4ccc-8ccc-"+String(writes.length).padStart(12,"0");
   }
   else if(p.endsWith("/user"))result=user;
   else if(p.endsWith("/tenant_settings"))result=null;
   await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(result),headers:{"access-control-allow-origin":"*"}});
 });
 const page=await ctx.newPage();
 await page.goto(base+"/crm/integrations");
 await page.getByRole("heading",{name:"Centro de Integraciones"}).waitFor();
 assert.equal(await page.locator(".tenant-brand-scope").getAttribute("data-tenant-brand"),"empresa-uno");
 await page.getByText("Sin conectar",{exact:true}).first().waitFor();
 assert.equal(writes.length,0,"loading dashboard must not connect provider");
 assert.ok(await page.getByText("Bloqueado para gasto").isVisible());
 await page.getByRole("button",{name:"Preparar conexión"}).first().click();
 await page.getByText("Preparar WhatsApp Business",{exact:true}).waitFor();
 await page.getByLabel("Número del negocio").fill("+1 849 570 6550");
 await page.getByRole("button",{name:"Registrar solicitud segura"}).click();
 await page.getByText("Solicitud registrada para esta empresa.",{exact:false}).waitFor();
 assert.equal(writes.length,1);
 assert.equal(writes[0].p_provider,"whatsapp");
 assert.equal(writes[0].p_identifier,"+18495706550");
 await page.getByText("Pendiente de autorización",{exact:true}).first().waitFor();
 assert.equal(await page.getByText("Número verificado en servidor").count(),0);
 assert.equal(await page.getByRole("textbox",{name:/contraseña|token|clave/i}).count(),0);
 const size=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,inner:innerWidth}));
 assert.ok(size.scroll<=size.inner+2,"mobile center must fit 390px: "+JSON.stringify(size));
 console.log("PASS: tenant-branded CRM integrations, real pending request, no false connected status or secrets (mocked API).");
}finally{if(browser)await browser.close();if(server)server.kill("SIGTERM");}
