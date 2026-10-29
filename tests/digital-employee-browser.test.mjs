// Mobile browser regression for the reusable employee studio.
// Uses controlled Supabase responses; never calls a real model or contacts real clients.
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {chromium} from "playwright";

const base=process.env.CRM_BROWSER_TEST_BASE_URL||"http://127.0.0.1:3180";
const server=process.env.CRM_BROWSER_TEST_BASE_URL?null:
  spawn(process.execPath,["node_modules/next/dist/bin/next","start","-p","3180","-H","127.0.0.1"],{stdio:["ignore","ignore","inherit"]});
let browser;
try{
  let ready=false;
  for(let i=0;i<60;i++){
    try{ready=(await fetch(base+"/login",{signal:AbortSignal.timeout(1000)})).ok;if(ready)break;}catch{}
    await new Promise(r=>setTimeout(r,500));
  }
  assert.ok(ready,"Next.js server is ready for employee studio test");
  browser=await chromium.launch({headless:true,channel:"chromium"});
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const tenant="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",uid="11111111-1111-4111-8111-111111111111";
  const user={id:uid,aud:"authenticated",role:"authenticated",email:"test-owner@example.invalid",app_metadata:{},user_metadata:{},created_at:new Date().toISOString()};
  const token=[Buffer.from("{}").toString("base64url"),Buffer.from(JSON.stringify({sub:uid,role:"authenticated",exp:Math.floor(Date.now()/1000)+3600})).toString("base64url"),"test-signature"].join(".");
  await context.addInitScript(({user,token})=>{
    localStorage.setItem("sb-ygipjqgyreeahslzorik-auth-token",JSON.stringify({
      access_token:token,refresh_token:"fake-qa-refresh",expires_at:Math.floor(Date.now()/1000)+3600,
      expires_in:3600,token_type:"bearer",user
    }));
  },{user,token});
  const agents=[],requests=[];
  await context.route("https://ygipjqgyreeahslzorik.supabase.co/**",async route=>{
    const req=route.request(),url=new URL(req.url()),path=url.pathname.split("/").pop();
    let data=[];
    if(path==="list_my_tenants")data=[{tenant_id:tenant,tenant_name:"Empresa Prueba",tenant_slug:"empresa-prueba",membership_role:"owner",is_active:true}];
    else if(path==="tenant_current_permissions")data={all:true};
    else if(path==="tenant_effective_modules")data=[{module_key:"settings",enabled:true}];
    else if(path==="user")data=user;
    else if(path==="ai_agents"){
      if(req.method()==="POST"){
        const payload=req.postDataJSON();
        assert.equal(payload.tenant_id,tenant,"employee belongs to active business");
        assert.equal(payload.status,"draft","no production activation");
        assert.equal(payload.approval_mode,"human_approval");
        assert.deepEqual(payload.allowed_tools,[],"no tools authorized");
        assert.equal(payload.settings.role,"recepcionista");
        const newAgent={...payload,id:"11111111-1111-4111-8111-222222222222",created_at:new Date().toISOString()};
        agents.unshift(newAgent);
        requests.push({type:"create",payload});
        data={id:newAgent.id};
      } else data=agents;
    }
    else if(url.pathname.includes("/functions/v1/ai-employee-draft")){
      requests.push({type:"model-request"});
      await route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({ok:false,error:"ai_provider_not_configured"}),headers:{"access-control-allow-origin":"*"}});
      return;
    }
    await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(data),headers:{"access-control-allow-origin":"*","content-range":"0-0/1"}});
  });
  const page=await context.newPage();
  await page.goto(base+"/crm/employees");
  await page.getByRole("heading",{name:"Empleados digitales con IA"}).waitFor();
  await page.getByText("Todavía no hay empleados digitales").waitFor();
  await page.getByLabel("Nombre del negocio").fill("Sublimaciones ficticias de prueba");
  await page.getByLabel("Servicios y productos comprobados").fill("Personalización de artículos, precios sujetos a cotización humana.");
  await page.getByRole("button",{name:"Guardar empleado en borrador"}).click();
  await page.getByText("Configuración guardada.",{exact:false}).waitFor();
  assert.equal(requests.filter(x=>x.type==="create").length,1);
  await page.getByRole("button",{name:/Recepcionista IA · Borrador/}).waitFor();
  const generate=page.getByRole("button",{name:"Generar borrador con IA"});
  assert.ok(await generate.isEnabled(),"saved draft allows opt-in manual model test");
  await generate.click();
  await page.getByText("No se pudo generar el borrador:",{exact:false}).waitFor();
  assert.equal(requests.filter(x=>x.type==="model-request").length,1);
  assert.equal(await page.getByText("Borrador generado por IA").count(),0,"mock provider error cannot be presented as success");
  await browser.close();browser=null;
  console.log("PASS: Android 390px employee draft creation, tenant guard and no false external send.");
}finally{
  if(browser)await browser.close();
  if(server){server.kill("SIGTERM");await new Promise(resolve=>setTimeout(resolve,300));}
}
