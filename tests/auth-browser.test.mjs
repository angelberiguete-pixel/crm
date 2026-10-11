// Controlled Auth responses test UI failure paths; real-session E2E is separate.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
const base=process.env.CRM_AUTH_TEST_BASE_URL||'http://127.0.0.1:3170';
const server=process.env.CRM_AUTH_TEST_BASE_URL?null:spawn(process.execPath,['node_modules/next/dist/bin/next','start','-p','3170','-H','127.0.0.1'],{stdio:['ignore','ignore','inherit']});
let browser;
try {
  let ready=false;
  for(let i=0;i<60;i++){try{ready=(await fetch(base+'/login',{signal:AbortSignal.timeout(1000)})).ok;if(ready)break;}catch{}await new Promise(resolve=>setTimeout(resolve,500));}
  assert.ok(ready);
  browser=await chromium.launch({headless:true,...(process.env.CRM_TEST_CHROMIUM_PATH?{executablePath:process.env.CRM_TEST_CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage']}:{channel:'chromium'})});
  const user={id:'11111111-1111-4111-8111-111111111111',aud:'authenticated',role:'authenticated',email:'qa@example.invalid',app_metadata:{},user_metadata:{},created_at:new Date().toISOString()};
  const exp=Math.floor(Date.now()/1000)+3600;
  const token=[Buffer.from('{}').toString('base64url'),Buffer.from(JSON.stringify({sub:user.id,role:'authenticated',exp})).toString('base64url'),'qa-signature'].join('.');
  async function fixture(ordinary=false){
    const context=await browser.newContext({viewport:{width:390,height:844}});
    if(ordinary)await context.addInitScript(({user,token,exp})=>localStorage.setItem('sb-ygipjqgyreeahslzorik-auth-token',JSON.stringify({access_token:token,refresh_token:'qa-refresh',expires_at:exp,expires_in:3600,token_type:'bearer',user})),{user,token,exp});
    const calls={updates:0,logouts:0};
    await context.route('https://ygipjqgyreeahslzorik.supabase.co/**',async route=>{
      const req=route.request(),url=new URL(req.url());let body=user,status=200;
      if(url.pathname.endsWith('/user')&&req.method()==='PUT'){calls.updates++;body={...user};}
      if(url.pathname.endsWith('/logout')){calls.logouts++;assert.equal(url.searchParams.get('scope'),calls.logouts===3?'local':'others');if(calls.logouts===1){status=400;body={code:'qa_temporary_failure',msg:'QA logout failed'};}else{status=204;body=null;}}
      if(url.pathname.endsWith('/platform_current_access'))body={is_platform_admin:false};
      await route.fulfill({status,contentType:'application/json',body:body===null?'':JSON.stringify(body)});
    });
    return {context,page:await context.newPage(),calls};
  }
  const plain=await fixture(true);
  await plain.page.goto(base+'/reset-password');
  await plain.page.getByText('Abre esta página desde un enlace de recuperación válido enviado a tu correo.').waitFor();
  assert.ok(await plain.page.getByLabel('Nueva contraseña',{exact:true}).isDisabled());
  assert.equal(plain.calls.updates,0);
  await plain.context.close();
  for(const path of ['/reset-password','/accept-invite']){
    const invalid=await fixture(true);
    await invalid.page.goto(base+path+'#error=access_denied&error_code=otp_expired');
    await invalid.page.getByText('El enlace venció o ya fue utilizado. Solicita un enlace nuevo.').waitFor();
    if(path==='/reset-password')assert.ok(await invalid.page.getByRole('button',{name:'Guardar contraseña'}).isDisabled());
    else assert.equal(await invalid.page.getByRole('button',{name:'Activar acceso al CRM'}).count(),0);
    await invalid.context.close();
  }
  const recovery=await fixture();
  await recovery.page.goto(base+'/reset-password#access_token='+token+'&refresh_token=qa-refresh&token_type=bearer&expires_in=3600&type=recovery');
  await recovery.page.getByLabel('Nueva contraseña',{exact:true}).waitFor();
  await recovery.page.waitForFunction(()=>!document.querySelector('input[autocomplete="new-password"]').disabled);
  await recovery.page.getByLabel('Nueva contraseña',{exact:true}).fill('QA-new-password-123');
  await recovery.page.getByLabel('Confirmar contraseña',{exact:true}).fill('QA-other-password-123');
  await recovery.page.getByRole('button',{name:'Guardar contraseña',exact:true}).click();
  await recovery.page.getByText('Las contraseñas no coinciden.').waitFor();assert.equal(recovery.calls.updates,0);
  await recovery.page.getByLabel('Confirmar contraseña',{exact:true}).fill('QA-new-password-123');
  await recovery.page.getByRole('button',{name:'Guardar contraseña',exact:true}).click();
  await recovery.page.getByRole('button',{name:'Cerrar sesiones y continuar',exact:true}).waitFor();
  assert.equal(recovery.calls.updates,1);assert.equal(recovery.calls.logouts,1);
  assert.ok(recovery.page.url().includes('/reset-password'),'failed global logout must not redirect to success');
  await recovery.page.getByRole('button',{name:'Cerrar sesiones y continuar',exact:true}).click();
  await recovery.page.waitForURL(/\/login\?reset=done/);
  assert.equal(recovery.calls.updates,1);assert.equal(recovery.calls.logouts,3);
  await recovery.page.getByText('Contraseña actualizada y sesiones anteriores cerradas. Inicia sesión con tu nueva contraseña.').waitFor();
  await recovery.context.close();
  console.log('PASS: ordinary session cannot reset, expired links denied, confirmation validated, failed global logout explained and retry closes sessions without a second password update (controlled Auth).');
}finally{if(browser)await browser.close();if(server)server.kill();}
