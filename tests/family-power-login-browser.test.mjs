// Family Power official logo/login and denied cross-company session at Android 390px.
// Uses a fake user and intercepted network: never touches real users or credentials.
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {chromium} from "playwright";
const base=process.env.CRM_BROWSER_TEST_BASE_URL||"http://127.0.0.1:3198";
const server=process.env.CRM_BROWSER_TEST_BASE_URL?null:spawn(process.execPath,
 ["node_modules/next/dist/bin/next","start","-p","3198","-H","127.0.0.1"],
 {stdio:["ignore","ignore","inherit"]});
let browser;
try{
 let ready=false;
 for(let i=0;i<60;i++){
   try{ready=(await fetch(base+"/family-power/login",{signal:AbortSignal.timeout(1500)})).ok;if(ready)break;}catch{}
   await new Promise(r=>setTimeout(r,450));
 }
 assert.ok(ready,"branded Family Power login should be available");
 browser=await chromium.launch({headless:true,channel:"chromium"});
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const page=await context.newPage();
 await page.goto(base+"/family-power/login",{waitUntil:"domcontentloaded"});
 await page.getByRole("heading",{name:"Bienvenido a tu espacio"}).waitFor();
 await page.getByRole("img",{name:/Family Power — Energía alternativa sin límites/}).waitFor();
 await page.getByRole("button",{name:"Entrar a Family Power"}).waitFor();
 assert.equal(await page.getByRole("button",{name:/Crear cuenta|Registrarse/i}).count(),0,
   "customer staff only enters by invitation");
 assert.equal(await page.getByText("LOOK SOCIAL MEDIA CRM",{exact:true}).count(),0);
 const svg=await page.locator('img[src="/client-brands/family-power/logo-negativo.svg"]').getAttribute("src");
 assert.ok(svg&&svg.includes("family-power"));
 const widths=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,inner:innerWidth}));
 assert.ok(widths.scroll<=widths.inner+2,"390px viewport must not overflow: "+JSON.stringify(widths));
 await context.close();

 const disallowed=await browser.newContext({viewport:{width:390,height:844},isMobile:true});
 const user={id:"11111111-1111-4111-8111-111111111111",aud:"authenticated",role:"authenticated",email:"test@example.invalid",app_metadata:{},user_metadata:{},created_at:new Date().toISOString()};
 const token=[Buffer.from("{}").toString("base64url"),Buffer.from(JSON.stringify({sub:user.id,role:"authenticated",exp:Math.floor(Date.now()/1000)+3600})).toString("base64url"),"mock-signature"].join(".");
 await disallowed.addInitScript(({user,token})=>{
  localStorage.setItem("sb-ygipjqgyreeahslzorik-auth-token",JSON.stringify({
    access_token:token,refresh_token:"qa-refresh",expires_at:Math.floor(Date.now()/1000)+3600,
    expires_in:3600,token_type:"bearer",user,
  }));
 },{user,token});
 const called=[];
 await disallowed.route("https://ygipjqgyreeahslzorik.supabase.co/**",async route=>{
   const url=new URL(route.request().url()),name=url.pathname.split("/").pop();
   called.push(name);
   const data=name==="list_my_tenants"?
      [{tenant_id:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",tenant_name:"Other Company",
        tenant_slug:"other-company",membership_role:"owner",is_active:true}]:
      name==="user"?user:[];
   await route.fulfill({status:200,contentType:"application/json",
     body:JSON.stringify(data),headers:{"access-control-allow-origin":"*"}});
 });
 const wrong=await disallowed.newPage();
 await wrong.goto(base+"/family-power/login",{waitUntil:"domcontentloaded"});
 await wrong.getByText(/no tiene acceso autorizado a Family Power/i).waitFor({timeout:12000});
 assert.ok(called.includes("list_my_tenants"));
 assert.equal(called.includes("set_active_tenant"),false,"must NEVER activate Family Power without membership");
 assert.ok(new URL(wrong.url()).pathname==="/family-power/login");
 console.log("PASS: authorized brand-only login; wrong-tenant sessions cannot activate Family Power; mobile layout works.");
 await disallowed.close();

 // An authorized alias is sent to Supabase Auth internally; no public registration
 // or real credential is used in this test.
 const managed=await browser.newContext({viewport:{width:390,height:844},isMobile:true});
 let receivedEmail="";
 await managed.route("https://ygipjqgyreeahslzorik.supabase.co/**",async route=>{
   const request=route.request();
   if(request.url().includes("/auth/v1/token")){
     receivedEmail=String(request.postDataJSON()?.email??"");
     await route.fulfill({status:400,contentType:"application/json",
       body:JSON.stringify({error:"invalid_grant",error_description:"Invalid login credentials"}),
       headers:{"access-control-allow-origin":"*"}});
   }else await route.fulfill({status:200,contentType:"application/json",body:"[]",
     headers:{"access-control-allow-origin":"*"}});
 });
 const login=await managed.newPage();
 await login.goto(base+"/family-power/login",{waitUntil:"domcontentloaded"});
 await login.getByLabel("Nombre de usuario o correo").fill("emerson.familia");
 await login.getByLabel("Contraseña").fill("fictitious-only-no-real-credential");
 await login.getByRole("button",{name:"Entrar a Family Power"}).click();
 await login.getByText(/Revisa tu usuario y contraseña/i).waitFor();
 assert.equal(receivedEmail,"family-power.emerson.familia@login.looksocialmedia.invalid",
   "managed username resolves internally but must authenticate through Supabase");
 await managed.close();
}finally{
 if(browser)await browser.close();
 if(server)server.kill("SIGTERM");
}
