// Automated Android-sized browser check with controlled Supabase responses.
// No production records or provider credentials are used.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const base = process.env.CRM_BROWSER_TEST_BASE_URL || "http://127.0.0.1:3171";
const server = process.env.CRM_BROWSER_TEST_BASE_URL ? null :
  spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", "3171", "-H", "127.0.0.1"], { stdio: ["ignore", "ignore", "inherit"] });
let browser;
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try { ready = (await fetch(base + "/login", { signal: AbortSignal.timeout(1000) })).ok; if (ready) break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.ok(ready, "application server ready");
  browser = await chromium.launch({ headless: true, ...(process.env.CRM_TEST_PROXY_URL ? { proxy: { server: process.env.CRM_TEST_PROXY_URL } } : { channel: "chromium" }) });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, ignoreHTTPSErrors: Boolean(process.env.CRM_TEST_PROXY_URL) });
  const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const user = { id: "11111111-1111-4111-8111-111111111111", aud: "authenticated", role: "authenticated", email: "qa@example.invalid", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
  const token = [Buffer.from("{}").toString("base64url"), Buffer.from(JSON.stringify({ sub: user.id, role: "authenticated", exp: Math.floor(Date.now()/1000)+3600 })).toString("base64url"), "test-signature"].join(".");
  const companies = [{ id:"co-1", name:"Empresa QA",sector:"Servicios",city:"Santo Domingo",email:"qa@example.invalid",phone:"8095551010",whatsapp_phone:"8095551010",website:null,created_at:new Date().toISOString() }];
  const contacts = [{ id:"ct-1",company_id:"co-1",display_name:"Contacto QA",job_title:"Gerente",email:"contacto@example.invalid",phone:"8095552020",whatsapp_phone:"8095552020",status:"lead",source:"manual",created_at:new Date().toISOString() }];
  const stages = [
    { id:"st-1",pipeline_id:"p-1",name:"Prospección",position:1,win_probability:.2,stage_type:"open" },
    { id:"st-2",pipeline_id:"p-1",name:"Propuesta",position:2,win_probability:.6,stage_type:"open" }
  ];
  const opportunities = [{
    id:"o-1",pipeline_id:"p-1",stage_id:"st-1",company_id:"co-1",contact_id:"ct-1",title:"Oportunidad QA",value:25000,currency:"DOP",probability:.2,status:"open",
    expected_close_date:null,owner_user_id:user.id,acquisition_source:"manual",loss_reason:null,lead_score:10,next_action:null,next_action_at:null,last_activity_at:null,created_at:new Date().toISOString()
  }];
  const writes=[];
  await context.addInitScript(({ user,token }) => {
    localStorage.setItem("sb-ygipjqgyreeahslzorik-auth-token", JSON.stringify({ access_token:token,refresh_token:"qa-refresh",expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:"bearer",user }));
  },{user,token});
  await context.route("https://ygipjqgyreeahslzorik.supabase.co/**", async route => {
    const req=route.request(),url=new URL(req.url()), path=url.pathname.split("/").pop();
    const json=()=>req.postDataJSON()||{};
    let data=[];
    if(path==="list_my_tenants") data=[{tenant_id:A,tenant_name:"Empresa QA",tenant_slug:"empresa-qa",membership_role:"owner",is_active:true}];
    else if(path==="tenant_current_permissions") data={all:true};
    else if(path==="tenant_effective_modules") data=["dashboard","companies","contacts","pipeline","inbox","products","quotations","calendar","operations"].map(module_key=>({module_key,enabled:true}));
    else if(path==="user") data=user;
    else if(path==="companies"){
      if(req.method()==="POST"){const body=json(); assert.equal(body.tenant_id,A);writes.push(["company-insert",body]);companies.push({...body,id:"co-2",created_at:new Date().toISOString(),website:null});data={};}
      else if(req.method()==="PATCH"){const body=json();assert.equal(url.searchParams.get("tenant_id"),"eq."+A);Object.assign(companies.find(c=>c.id===url.searchParams.get("id")?.slice(3)),body);writes.push(["company-update",body]);data={id:"co-1"};}
      else data=companies;
    }
    else if(path==="contacts"){
      if(req.method()==="PATCH"){const body=json(); assert.equal(url.searchParams.get("tenant_id"),"eq."+A);Object.assign(contacts[0],body);writes.push(["contact-update",body]);data={id:"ct-1"};}
      else data=contacts;
    }
    else if(path==="pipelines") data=[{id:"p-1",name:"Ventas",is_default:true}];
    else if(path==="pipeline_stages") data=stages;
    else if(path==="opportunities"){
      if(req.method()==="POST"){const body=json();assert.equal(body.tenant_id,A);writes.push(["opportunity-insert",body]);opportunities.push({...opportunities[0],...body,id:"o-2",created_at:new Date().toISOString()});data={id:"o-2"};}
      else if(req.method()==="PATCH"){const body=json(); assert.equal(url.searchParams.get("tenant_id"),"eq."+A); const id=url.searchParams.get("id")?.slice(3);Object.assign(opportunities.find(o=>o.id===id),body);writes.push(["opportunity-update",body]);data={id};}
      else data=opportunities;
    }
    else if(path==="tasks") {writes.push(["task",json()]);data={};}
    await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(data),headers:{"access-control-allow-origin":"*","content-range":"0-0/1"}});
  });
  const page=await context.newPage();
  await page.goto(base+"/crm/companies");
  await page.getByText("Empresa QA",{exact:true}).last().waitFor();
  await page.getByRole("button",{name:"Editar empresa"}).click();
  await page.getByLabel("Nombre",{exact:true}).fill("Empresa QA editada");
  await page.getByRole("button",{name:"Guardar cambios"}).click();
  await page.getByText("Cambios guardados correctamente.").waitFor();
  assert.ok(writes.some(([type])=>type==="company-update"),"company editing reaches Supabase");
  await page.getByRole("button",{name:"+ Nueva empresa"}).click();
  await page.getByLabel("Nombre",{exact:true}).fill("Empresa nueva QA");
  await page.getByRole("button",{name:"Guardar empresa"}).click();
  await page.getByText("Empresa registrada correctamente.").waitFor();
  assert.equal(writes.filter(([type])=>type==="company-insert").length,1);
  await page.goto(base+"/crm/contacts");
  await page.getByRole("button",{name:"Editar contacto"}).click();
  await page.getByLabel("Nombre",{exact:true}).fill("Contacto actualizado");
  await page.getByRole("button",{name:"Guardar cambios"}).click();
  await page.getByText("Cambios guardados correctamente.").waitFor();
  assert.ok(writes.some(([type])=>type==="contact-update"),"contact editing reaches Supabase");
  await page.goto(base+"/crm/revenue");
  await page.getByRole("heading",{name:"Oportunidades",exact:true}).waitFor();
  await page.getByRole("button",{name:"Nueva oportunidad"}).click();
  await page.getByLabel("Nombre de la oportunidad").fill("Nuevo negocio QA");
  await page.getByLabel("Valor estimado en RD$").fill("8000");
  await page.getByRole("button",{name:"Guardar oportunidad"}).click();
  await page.getByText("Oportunidad registrada correctamente.").waitFor();
  assert.equal(writes.filter(([type])=>type==="opportunity-insert").length,1);
  await page.getByLabel("Etapa de Oportunidad QA").selectOption("st-2");
  await page.getByText("Oportunidad movida a Propuesta.").waitFor();
  assert.ok(writes.some(([type,body])=>type==="opportunity-update"&&body.stage_id==="st-2"),"touch stage selector persists");
  const dims=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,viewport:innerWidth}));
  assert.ok(dims.scroll <= dims.viewport+1,"Android viewport does not overflow horizontally");
  console.log("PASS: mobile customers, contact updates, opportunity creation, touch stage changes, tenant-scoped mutations and no page overflow (controlled API).");
} finally {
  if(browser) await browser.close();
  if(server) server.kill();
}
