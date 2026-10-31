// Real Next.js mobile rendering with controlled Supabase fixtures.
// This checks identity isolation only; it does not impersonate production customers.
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {chromium} from "playwright";

const base=process.env.CRM_BROWSER_TEST_BASE_URL||"http://127.0.0.1:3195";
const server=process.env.CRM_BROWSER_TEST_BASE_URL?null:spawn(process.execPath,
  ["node_modules/next/dist/bin/next","start","-p","3195","-H","127.0.0.1"],
  {stdio:["ignore","ignore","inherit"]});
let browser;
try{
  let ready=false;
  for(let i=0;i<60;i++){try{ready=(await fetch(base+"/login",{signal:AbortSignal.timeout(1000)})).ok;if(ready)break;}catch{}
    await new Promise(r=>setTimeout(r,500));
  }
  assert.ok(ready,"white-label test server ready");
  browser=await chromium.launch({headless:true,channel:"chromium"});
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const A="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", B="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  let activeId=A;
  const rows=new Map([
    [A,{tenant_id:A,brand_name:"Look Social Media",primary_color:"#2563EB",secondary_color:"#7C3AED",accent_color:"#00D4FF",logo_url:null,favicon_url:null}],
    [B,{tenant_id:B,brand_name:"Sublimaciones Lazala",primary_color:"#0f766e",secondary_color:"#14532d",accent_color:"#f59e0b",logo_url:null,favicon_url:null}],
  ]);
  const reads=[];
  const user={id:"11111111-1111-4111-8111-111111111111",aud:"authenticated",role:"authenticated",email:"qa@example.invalid",app_metadata:{},user_metadata:{},created_at:new Date().toISOString()};
  const token=[Buffer.from("{}").toString("base64url"),Buffer.from(JSON.stringify({sub:user.id,role:"authenticated",exp:Math.floor(Date.now()/1000)+3600})).toString("base64url"),"mock-signature"].join(".");
  await context.addInitScript(({user,token})=>{
    localStorage.setItem("sb-ygipjqgyreeahslzorik-auth-token",JSON.stringify({
      access_token:token,refresh_token:"qa-test-refresh",
      expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:"bearer",user,
    }));
  },{user,token});
  await context.route("https://ygipjqgyreeahslzorik.supabase.co/**",async route=>{
    const req=route.request(),url=new URL(req.url()),path=url.pathname.split("/").pop();
    let response=[];
    if(path==="list_my_tenants")response=[
      {tenant_id:A,tenant_name:"Look Social Media",tenant_slug:"eurevector",membership_role:"owner",is_active:activeId===A},
      {tenant_id:B,tenant_name:"Sublimaciones Lazala",tenant_slug:"sublimaciones-lazala",membership_role:"owner",is_active:activeId===B},
    ];
    else if(path==="set_active_tenant"){activeId=req.postDataJSON().p_tenant_id;response={tenant_id:activeId,role:"owner"};}
    else if(path==="tenant_current_permissions")response={all:true};
    else if(path==="tenant_effective_modules")response=[{module_key:"dashboard",enabled:true},{module_key:"settings",enabled:true}];
    else if(path==="user")response=user;
    else if(path==="tenant_settings"){
      const id=url.searchParams.get("tenant_id")?.replace("eq.","");
      assert.ok(id===A||id===B,"brand must request only an existing tenant fixture");
      reads.push(id);
      if(req.method()==="PATCH"){
        const data=req.postDataJSON();
        const current=rows.get(id);
        rows.set(id,{...current,...data});
        response={tenant_id:id};
      }else response=rows.get(id);
    } else if(path==="tenant_erp_status")response=null;
    else if(path==="revenue_command_center_dashboard")response=null;
    await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(response),
      headers:{"access-control-allow-origin":"*","content-range":"0-0/1"}});
  });
  const page=await context.newPage();
  await page.goto(base+"/crm");
  await page.getByRole("heading",{name:"Portal de Look Social Media"}).waitFor();
  assert.ok(await page.getByRole("img",{name:"LOOK SOCIAL MEDIA"}).isVisible(),"official logo stays on its own tenant");
  assert.equal(await page.locator(".tenant-brand-scope").getAttribute("data-tenant-brand"),"eurevector");
  assert.equal((await page.locator(".tenant-brand-scope").evaluate(e=>getComputedStyle(e).getPropertyValue("--accent"))).trim().toLowerCase(),"#2563eb");
  assert.equal(await page.getByRole("img",{name:"Logo de Sublimaciones Lazala"}).count(),0,"other brand must not leak");
  assert.equal(await page.getByLabel("Empresa activa").count(),0,"no tenant selector in client header");
  activeId=B;
  await page.reload();
  await page.getByRole("heading",{name:"Portal de Sublimaciones Lazala"}).waitFor();
  await page.getByRole("img",{name:"Logo de Sublimaciones Lazala"}).waitFor();
  assert.equal(await page.getByRole("img",{name:"LOOK SOCIAL MEDIA"}).count(),0,"client portal cannot display platform logo");
  assert.equal(await page.locator(".tenant-brand-scope").getAttribute("data-tenant-brand"),"sublimaciones-lazala");
  assert.equal((await page.locator(".tenant-brand-scope").evaluate(e=>getComputedStyle(e).getPropertyValue("--accent"))).trim().toLowerCase(),"#0f766e");
  assert.equal(await page.title(),"Sublimaciones Lazala | CRM");
  await page.goto(base+"/crm/settings");
  await page.getByRole("heading",{name:"Identidad de tu negocio"}).waitFor();
  await page.getByLabel("Nombre comercial").fill("Lazala Personalizados");
  await page.getByRole("button",{name:"Guardar identidad visual"}).click();
  await page.getByText("Identidad visual guardada para esta empresa.").waitFor();
  await page.getByText("Lazala Personalizados",{exact:true}).first().waitFor();
  assert.equal(rows.get(A).brand_name,"Look Social Media","save cannot mutate other business branding");
  assert.equal(rows.get(B).brand_name,"Lazala Personalizados");
  activeId=A;
  await page.reload();
  await page.getByRole("heading",{name:"Configuración"}).waitFor();
  await page.getByRole("img",{name:"LOOK SOCIAL MEDIA"}).waitFor();
  assert.equal(await page.getByRole("img",{name:"Logo de Sublimaciones Lazala"}).count(),0);
  assert.ok(reads.includes(A)&&reads.includes(B),"both brand configs were tenant-scoped");
  console.log("PASS: tenant-specific logo, CSS, title, settings update and isolated company context on Android viewport.");
}finally{
  if(browser)await browser.close();
  if(server)server.kill("SIGTERM");
}
