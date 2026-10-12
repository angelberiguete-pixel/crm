// Controlled browser API responses: this verifies buttons and messages, not Meta/Gmail OAuth.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const base=process.env.CRM_BROWSER_TEST_BASE_URL||"http://127.0.0.1:3169";
const server=process.env.CRM_BROWSER_TEST_BASE_URL?null:spawn(process.execPath,["node_modules/next/dist/bin/next","start","-p","3169","-H","127.0.0.1"],{stdio:["ignore","ignore","inherit"]});
let browser;
try {
  let ready=false;
  for(let i=0;i<60;i++){
    try {ready=(await fetch(base+"/login",{signal:AbortSignal.timeout(1000)})).ok;if(ready)break;}catch{}
    await new Promise(r=>setTimeout(r,500));
  }
  assert.ok(ready,"Next.js test server ready");
  browser=await chromium.launch({headless:true,...(process.env.CRM_TEST_CHROMIUM_PATH?{executablePath:process.env.CRM_TEST_CHROMIUM_PATH,args:["--no-sandbox","--disable-dev-shm-usage"]}:{channel:"chromium"})});
  const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const tenant="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const owner="11111111-1111-4111-8111-111111111111";
  const user={id:owner,aud:"authenticated",role:"authenticated",email:"owner@example.invalid",app_metadata:{},user_metadata:{},created_at:new Date().toISOString()};
  const token=[Buffer.from("{}").toString("base64url"),Buffer.from(JSON.stringify({sub:owner,role:"authenticated",exp:Math.floor(Date.now()/1000)+3600})).toString("base64url"),"test-signature"].join(".");
  await ctx.addInitScript(({user,token})=>localStorage.setItem("sb-ygipjqgyreeahslzorik-auth-token",JSON.stringify({access_token:token,refresh_token:"mock",expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:"bearer",user})),{user,token});
  const requests=[];
  await ctx.route("https://ygipjqgyreeahslzorik.supabase.co/**",async route=>{
    const req=route.request(),u=new URL(req.url());
    let data=[];
    if(u.pathname.endsWith("/list_my_tenants"))data=[{tenant_id:tenant,tenant_name:"Empresa QA",tenant_slug:"empresa-qa",membership_role:"owner",is_active:true}];
    else if(u.pathname.endsWith("/tenant_current_permissions"))data={all:true};
    else if(u.pathname.endsWith("/tenant_effective_modules"))data=[{module_key:"settings",enabled:true}];
    else if(u.pathname.endsWith("/tenant_channel_requests_overview"))data=requests.map((x,i)=>({
      channel_id:"dddddddd-dddd-4ddd-8ddd-"+String(i+1).padStart(12,"0"),
      provider:x.p_provider,display_name:x.p_channel_name,
      request_identifier:x.p_identifier,record_status:"disconnected",
      request_stage:"Pendiente de autorización",requested_at:new Date().toISOString()
    }));
    else if(u.pathname.endsWith("/tenant_register_channel_request")){
      const body=req.postDataJSON();
      assert.equal(body.p_tenant_id,tenant,"request must be for selected company");
      assert.ok(["whatsapp","instagram","email"].includes(body.p_provider));
      requests.push(body);
      data="dddddddd-dddd-4ddd-8ddd-"+String(requests.length).padStart(12,"0");
    }
    else if(u.pathname.endsWith("/user"))data=user;
    else if(u.pathname.endsWith("/platform_current_access"))data={is_platform_admin:false};
    await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(data),headers:{"access-control-allow-origin":"*"}});
  });
  const page=await ctx.newPage();
  await page.goto(base+"/crm/channels");
  await page.getByRole("heading",{name:"Canales de atención"}).waitFor();
  await page.getByText("Todavía no hay solicitudes.").waitFor();
  await page.getByText("Una solicitud no equivale a una conexión.").waitFor();
  assert.equal(requests.length,0,"page load must not auto-connect a provider");
  await page.getByRole("textbox",{name:"Número de WhatsApp con código de país"}).fill("+1 829 648 0491");
  await page.getByRole("button",{name:"Registrar solicitud"}).click();
  await page.getByText("Solicitud registrada.",{exact:false}).waitFor();
  await page.getByText("+1 829 648 0491",{exact:true}).waitFor();
  assert.equal(requests.length,1);
  assert.equal(requests[0].p_provider,"whatsapp");
  assert.equal(requests[0].p_identifier,"+1 829 648 0491");
  assert.equal(requests[0].p_channel_name,"WhatsApp comercial");
  await page.getByRole("button",{name:"Instagram"}).click();
  await page.getByRole("textbox",{name:"Usuario de Instagram"}).fill("@Mi.Tienda");
  await page.getByRole("button",{name:"Registrar solicitud"}).click();
  await page.getByText("@Mi.Tienda",{exact:true}).waitFor();
  assert.equal(requests.length,2);
  assert.equal(requests[1].p_provider,"instagram");
  await page.getByRole("button",{name:"Correo"}).click();
  await page.getByRole("textbox",{name:"Dirección de correo comercial"}).fill("ventas@empresa.com");
  await page.getByRole("button",{name:"Registrar solicitud"}).click();
  await page.getByText("ventas@empresa.com",{exact:true}).waitFor();
  assert.equal(requests.length,3);
  assert.ok(await page.getByText("Pendiente de verificación",{exact:true}).count()>=3);
  const overflow=await page.evaluate(()=>({width:document.documentElement.scrollWidth,screen:innerWidth}));
  assert.ok(overflow.width<=overflow.screen+1,"channel setup must fit Android 390px");
  console.log("PASS mobile: requested WhatsApp, Instagram and email; tenant scoping, pending-only state, no fake connection (mocked API).");
} finally {if(browser)await browser.close();if(server)server.kill();}
