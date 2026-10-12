// Controlled API browser regression only. NO real recovery token or password is used.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
const base=process.env.CRM_FIRST_ACCESS_TEST_BASE_URL||'http://127.0.0.1:3172';
const server=process.env.CRM_FIRST_ACCESS_TEST_BASE_URL?null:spawn(process.execPath,['node_modules/next/dist/bin/next','start','-p','3172','-H','127.0.0.1'],{stdio:['ignore','ignore','inherit']});
let browser;
try{
 let ready=false;
 for(let i=0;i<60;i++){
  try{ready=(await fetch(base+'/first-access',{signal:AbortSignal.timeout(1000)})).ok;if(ready)break}catch{}
  await new Promise(resolve=>setTimeout(resolve,500));
 }
 assert.ok(ready,'first-access page should render');
 browser=await chromium.launch({headless:true,...(process.env.CRM_TEST_CHROMIUM_PATH?{executablePath:process.env.CRM_TEST_CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage']}:{channel:'chromium'})});
 const ctx=await browser.newContext({viewport:{width:390,height:844}});
 const user={id:'11111111-1111-4111-8111-111111111111',aud:'authenticated',role:'authenticated',email:'owner-qa@example.invalid',app_metadata:{},user_metadata:{},created_at:new Date().toISOString(),email_confirmed_at:new Date().toISOString()};
 const token=[Buffer.from('{}').toString('base64url'),Buffer.from(JSON.stringify({sub:user.id,role:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url'),'qa-signature'].join('.');
 const calls={bootstrap:0,verify:0,password:0};
 await ctx.route('https://ygipjqgyreeahslzorik.supabase.co/**',async route=>{
  const req=route.request(),url=new URL(req.url());
  let status=200,payload={};
  if(url.pathname.endsWith('/owner-initial-password')){
    calls.bootstrap++;
    assert.equal(req.method(),'POST');
    assert.equal(req.postDataJSON().ticket,'A'.repeat(44));
    payload={owner_id:user.id,token_hash:'mock-recovery-token-hash'};
  }else if(url.pathname.endsWith('/verify')){
    calls.verify++;const input=req.postDataJSON();
    assert.equal(input.type,'recovery');assert.equal(input.token_hash,'mock-recovery-token-hash');
    payload={access_token:token,refresh_token:'qa-refresh',expires_in:3600,token_type:'bearer',user};
  }else if(url.pathname.endsWith('/platform_current_access'))payload={is_platform_admin:true};
  else if(url.pathname.endsWith('/user')&&req.method()==='PUT'){calls.password++;assert.equal(req.postDataJSON().password,'long-qa-password-123');payload={...user};}
  else if(url.pathname.endsWith('/logout')){status=204;payload=null;}
  else if(url.pathname.endsWith('/user'))payload=user;
  else if(url.pathname.endsWith('/platform_admin_tenants'))payload=[];
  else if(url.pathname.endsWith('/plans'))payload=[];
  await route.fulfill({status,contentType:'application/json',body:payload===null?'':JSON.stringify(payload),headers:{'access-control-allow-origin':'*'}});
 });
 const page=await ctx.newPage();
 await page.goto(base+'/first-access');
 await page.getByText('Este enlace de activación no es válido. Solicita un nuevo acceso seguro.').waitFor();
 assert.equal(calls.bootstrap,0,'no code must never call privileged bootstrap');
 await page.goto(base+'/login'); // Force full document navigation; a hash-only navigation would not remount React.\n await page.goto(base+'/first-access#ticket='+'A'.repeat(44));
 try{await page.getByRole('button',{name:'Crear contraseña y entrar'}).waitFor({timeout:8000});}catch(error){console.error('FIRST-ACCESS DIAGNOSTIC:',(await page.locator('body').innerText()).slice(0,1600),JSON.stringify(calls));throw error;}
 assert.equal(new URL(page.url()).hash,'','one-time ticket must be cleared from address bar');
 await page.getByLabel('Nueva contraseña').fill('long-qa-password-123');
 await page.getByLabel('Confirmar contraseña').fill('long-qa-password-xxx');
 await page.getByRole('button',{name:'Crear contraseña y entrar'}).click();
 await page.getByText('Las contraseñas no coinciden.').waitFor();
 assert.equal(calls.password,0,'mismatched password must not update auth');
 await page.getByLabel('Confirmar contraseña').fill('long-qa-password-123');
 await page.getByRole('button',{name:'Crear contraseña y entrar'}).click();
 await page.waitForURL(/\/platform-admin/);
 assert.equal(calls.bootstrap,1);
 assert.equal(calls.verify,1);
 assert.equal(calls.password,1);
 console.log('PASS: no-ticket is blocked, one-time ticket exchanged, recovery Auth verified, password mismatch blocked, owner redirected (all external Auth responses mocked).');
}finally{if(browser)await browser.close();if(server)server.kill();}
