// Opt-in real-production E2E. Requires disposable, explicitly provisioned QA
// accounts/tenants in CRM_LIVE_QA_FIXTURE_FILE. Never use customer credentials.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const f = JSON.parse(readFileSync(process.env.CRM_LIVE_QA_FIXTURE_FILE, 'utf8'));
assert.ok(f.email_a.endsWith('@example.invalid') && f.email_b.endsWith('@example.invalid') && f.email_admin.endsWith('@example.invalid'));
const base = process.env.CRM_LIVE_TEST_BASE_URL || 'https://crm-revenue-os.vercel.app';
const server=base.startsWith('http://127.0.0.1:')?spawn(process.execPath,['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p',new URL(base).port],{stdio:['ignore','ignore','inherit']}):null;
if(server){let ready=false;for(let i=0;i<60;i++){try{ready=(await fetch(base+'/login',{signal:AbortSignal.timeout(1000)})).ok;if(ready)break;}catch{}await new Promise(resolve=>setTimeout(resolve,500));}assert.ok(ready);}
const browser = await chromium.launch({headless:true, ...(process.env.CRM_TEST_PROXY_URL?{proxy:{server:process.env.CRM_TEST_PROXY_URL,bypass:'127.0.0.1,localhost'}}:{}), ...(process.env.CRM_TEST_CHROMIUM_PATH?{executablePath:process.env.CRM_TEST_CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage']}:{channel:'chromium'})});
const reports=[];
try {
  async function login(email) {
    const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,ignoreHTTPSErrors:Boolean(process.env.CRM_TEST_PROXY_URL)});
    const page=await context.newPage();
    await page.goto(base+'/login');
    await page.getByLabel('Email',{exact:true}).fill(email);
    await page.getByLabel('Contraseña',{exact:true}).fill(f.password);
    await page.getByRole('button',{name:'Entrar',exact:true}).click();
    await page.waitForURL(/\/(crm|platform-admin)(\/|$)/,{timeout:60000});
    return {context,page};
  }
  for(const suffix of ['a','b']) {
    const {context,page}=await login(f['email_'+suffix]);
    await page.goto(base+'/crm/companies');
    await page.getByText('QA E2E Company '+suffix.toUpperCase(),{exact:true}).waitFor({timeout:60000});
    const other=suffix==='a'?'b':'a';
    assert.equal(await page.getByText('QA E2E Company '+other.toUpperCase(),{exact:true}).count(),0);
    const access=await page.evaluate(async otherTenant=>{
      const fetcher=(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(15000)});
      const session=JSON.parse(localStorage.getItem('sb-ygipjqgyreeahslzorik-auth-token'));
      const headers={apikey:'sb_publishable_2Q7aF-M61t2OZWRrt-vebQ_t_oNK_u7',Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'};
      const url='https://ygipjqgyreeahslzorik.supabase.co/rest/v1/companies?tenant_id=eq.'+otherTenant;
      const read=await fetcher(url+'&select=id', {headers});
      const rows=await read.json();
      const write=await fetcher('https://ygipjqgyreeahslzorik.supabase.co/rest/v1/companies',{method:'POST',headers,body:JSON.stringify({tenant_id:otherTenant,name:'QA forbidden cross tenant'})});
      const update=await fetcher(url,{method:'PATCH',headers:{...headers,Prefer:'return=representation'},body:JSON.stringify({name:'QA forbidden cross tenant'})});
      const updated=await update.json();
      const remove=await fetcher(url,{method:'DELETE',headers:{...headers,Prefer:'return=representation'}});
      const removed=await remove.json();
      const admin=await fetcher('https://ygipjqgyreeahslzorik.supabase.co/rest/v1/rpc/platform_create_client_tenant',{method:'POST',headers,body:JSON.stringify({p_name:'QA denied',p_slug:'qa-denied-'+crypto.randomUUID(),p_plan_code:'essential',p_vertical:'services',p_template_key:null})});
      return {read:read.status,rows:rows.length,write:write.status,updated:Array.isArray(updated)?updated.length:null,removed:Array.isArray(removed)?removed.length:null,admin:admin.status};
    },f['tenant_'+other]);
    assert.equal(access.read,200);assert.equal(access.rows,0);assert.equal(access.write,403);assert.equal(access.updated,0);assert.equal(access.removed,0);assert.ok(access.admin>=400);
    console.log(`PASS: real login ${suffix.toUpperCase()}, own company and cross-tenant REST restrictions.`);
    await page.locator('.mobile-tenant-navigation summary').click();
    await page.getByRole('button',{name:'Salir',exact:true}).click();
    await page.waitForURL(/\/login/,{timeout:30000});
    assert.equal(await page.evaluate(()=>localStorage.getItem('sb-ygipjqgyreeahslzorik-auth-token')),null);
    reports.push(`PASS: real login ${suffix.toUpperCase()}, own company only, cross-tenant REST CRUD denied, platform RPC denied and logout.`);
    await context.close();
  }
  const {context,page}=await login(f.email_admin);
  assert.ok(page.url().includes('/platform-admin'));
  await page.getByRole('heading',{name:'LOOK SOCIAL MEDIA · Super Admin'}).waitFor({timeout:60000});
  const row=page.getByRole('row').filter({has:page.getByText('QA E2E A',{exact:true})});
  await row.getByRole('button',{name:'Gestionar',exact:true}).click();
  await page.getByRole('button',{name:'Entrar al CRM',exact:true}).click();
  await page.waitForURL(/\/crm/,{timeout:30000});
  await page.goto(base+'/crm/companies');
  await page.getByText('QA E2E Company A',{exact:true}).waitFor({timeout:60000});
  assert.equal(await page.getByText('QA E2E Company B',{exact:true}).count(),0);
  reports.push('PASS: real Super Admin login routes to platform-admin and enters the explicitly selected QA client.');
  await page.locator('.mobile-tenant-navigation summary').click();
  await page.getByRole('button',{name:'Salir',exact:true}).click();
  await context.close();
  console.log(reports.join('\n'));
} finally { await browser.close();if(server)server.kill(); }
