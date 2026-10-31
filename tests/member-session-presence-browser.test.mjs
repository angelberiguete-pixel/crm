// Browser regression: fake JWT and intercepted Supabase traffic only.
// Never creates real sessions, sends messages or uses customer credentials.
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {chromium} from "playwright";

const base=process.env.CRM_BROWSER_TEST_BASE_URL||"http://127.0.0.1:3199";
const server=process.env.CRM_BROWSER_TEST_BASE_URL?null:spawn(
  process.execPath,["node_modules/next/dist/bin/next","start","-p","3199","-H","127.0.0.1"],
  {stdio:["ignore","ignore","inherit"]}
);
let browser;
try{
  let ready=false;
  for(let i=0;i<60;i++){
    try{ready=(await fetch(base+"/login",{signal:AbortSignal.timeout(1000)})).ok;if(ready)break;}catch{}
    await new Promise(r=>setTimeout(r,500));
  }
  assert.ok(ready,"CRM must be ready");
  browser=await chromium.launch({headless:true,channel:"chromium"});
  const tenantId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const user={id:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",email:"owner@example.invalid",
    aud:"authenticated",role:"authenticated",app_metadata:{},user_metadata:{},created_at:new Date().toISOString()};
  const token=[Buffer.from("{}").toString("base64url"),
    Buffer.from(JSON.stringify({sub:user.id,role:"authenticated",exp:Math.floor(Date.now()/1000)+3600})).toString("base64url"),
    "test-signature"].join(".");
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await context.addInitScript(({user,token})=>{
    localStorage.setItem("sb-ygipjqgyreeahslzorik-auth-token",JSON.stringify({
      access_token:token,refresh_token:"fake",expires_at:Math.floor(Date.now()/1000)+3600,
      expires_in:3600,token_type:"bearer",user
    }));
  },{user,token});
  let role="owner",heartbeats=0,closes=0,reports=0;
  const heartbeatedTenants=[];
  await context.route("https://ygipjqgyreeahslzorik.supabase.co/**",async route=>{
    const req=route.request(),url=new URL(req.url()),name=url.pathname.split("/").pop();
    let data=[];
    if(name==="user")data=user;
    else if(name==="list_my_tenants")data=[{
      tenant_id:tenantId,tenant_name:"Empresa QA",tenant_slug:"empresa-qa",
      membership_role:role,is_active:true
    }];
    else if(name==="tenant_current_permissions")data={all:true};
    else if(name==="tenant_effective_modules")data=[{module_key:"settings",enabled:true}];
    else if(name==="crm_member_session_heartbeat"){
      heartbeats++;
      heartbeatedTenants.push(req.postDataJSON().p_tenant_id);
      data={session_id:"qa-session",active_seconds:0};
    }
    else if(name==="crm_member_session_close"){
      closes++;
      assert.equal(req.postDataJSON().p_tenant_id,tenantId);
      data=null;
    }
    else if(name==="crm_tenant_member_session_report"){
      reports++;
      assert.equal(req.postDataJSON().p_tenant_id,tenantId);
      data=[{user_id:user.id,member_email:user.email,member_role:"owner",
        signed_in_at:"2026-10-31T12:00:00Z",last_seen_at:"2026-10-31T12:02:05Z",
        active_seconds:125,signed_out_at:null,is_online:true}];
    }
    await route.fulfill({status:200,contentType:"application/json",
      headers:{"access-control-allow-origin":"*","content-range":"0-0/1"},
      body:JSON.stringify(data)});
  });
  const owner=await context.newPage();
  await owner.goto(base+"/crm/sessions");
  await owner.getByRole("heading",{name:"Sesiones del equipo"}).waitFor({timeout:15000});
  await owner.getByRole("table",{name:"Historial de sesiones del equipo"}).waitFor();
  await owner.getByText("2 min 5 s").waitFor();
  await owner.getByRole("cell",{name:"En línea",exact:true}).waitFor();
  assert.ok(heartbeats>=1,"authenticated tenant view must record presence");
  assert.ok(heartbeatedTenants.every(x=>x===tenantId),"presence must use verified tenant context");
  assert.equal(reports,1,"owner can view session report");
  await owner.setViewportSize({width:1280,height:850});
  await owner.locator(".tenant-session-exit summary").click();
  await owner.getByRole("button",{name:"Cerrar sesión del cliente"}).waitFor();
  await owner.setViewportSize({width:390,height:844});

  await owner.locator(".mobile-tenant-navigation summary").click();
  await owner.getByRole("navigation",{name:"Otros módulos de Empresa QA"}).getByRole("link",{name:"Sesiones del equipo"}).waitFor();
  await owner.getByRole("button",{name:"Salir",exact:true}).click();
  await owner.waitForURL(/\/login/,{timeout:15000});
  assert.equal(closes,1,"close RPC is called before logout");

  role="agent";
  const agent=await context.newPage();
  await agent.goto(base+"/crm/sessions");
  await agent.getByText(/Solo el propietario o administrador/).waitFor({timeout:15000});
  assert.equal(reports,1,"agent must never query company session report");
  console.log("PASS: scoped heartbeat, owner-only report, duration, explicit logout closure and agent denial (mocked network).");
  await context.close();
}finally{
  if(browser)await browser.close();
  if(server)server.kill("SIGTERM");
}
