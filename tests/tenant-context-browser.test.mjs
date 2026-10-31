// Browser behavior tests use stubbed Supabase responses. RLS is tested separately
// by tenant-isolation.sql against the database; these are not live-login tests.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const base = process.env.CRM_BROWSER_TEST_BASE_URL || 'http://127.0.0.1:3169';
const server = process.env.CRM_BROWSER_TEST_BASE_URL ? null : spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', '3169', '-H', '127.0.0.1'], { stdio: ['ignore','ignore','inherit'] });
let browser;
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try { ready = (await fetch(base + '/login', { signal: AbortSignal.timeout(1000) })).ok; if (ready) break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.ok(ready, 'test web server is ready');
  browser = await chromium.launch({ headless: true, ...(process.env.CRM_TEST_PROXY_URL ? { proxy: { server: process.env.CRM_TEST_PROXY_URL } } : {}), ...(process.env.CRM_TEST_CHROMIUM_PATH ? { executablePath: process.env.CRM_TEST_CHROMIUM_PATH, args: ['--no-sandbox','--disable-dev-shm-usage'] } : { channel: 'chromium' }) });
  // The optional workspace proxy terminates TLS; this fixture-only test has no real credentials.
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, ignoreHTTPSErrors: Boolean(process.env.CRM_TEST_PROXY_URL) });
  const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  let activeId = null;
  let denyPipeline = false;
  const reads = [];let createdCompany=null,companyInsertCount=0;
  const user = { id: '11111111-1111-4111-8111-111111111111', aud: 'authenticated', role: 'authenticated', email: 'qa@example.invalid', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
  const token = [Buffer.from('{}').toString('base64url'), Buffer.from(JSON.stringify({ sub: user.id, role: 'authenticated', exp: Math.floor(Date.now()/1000)+3600 })).toString('base64url'), 'test-signature'].join('.');
  await context.addInitScript(({ user, token, B }) => {
    localStorage.setItem('sb-ygipjqgyreeahslzorik-auth-token', JSON.stringify({ access_token: token, refresh_token: 'qa-refresh', expires_at: Math.floor(Date.now()/1000)+3600, expires_in: 3600, token_type: 'bearer', user }));
    localStorage.setItem('crm_active_tenant_id', B); // obsolete value must never win
  }, { user, token, B });
  await context.route('https://ygipjqgyreeahslzorik.supabase.co/**', async route => {
    const request = route.request(), url = new URL(request.url());
    let response = [];
    if (url.pathname.endsWith('/list_my_tenants')) response = [A,B].map((id,i) => ({ tenant_id:id, tenant_name:i?'QA B':'QA A', tenant_slug:i?'qa-b':'qa-a', membership_role:'owner', is_active:activeId===id }));
    else if (url.pathname.endsWith('/set_active_tenant')) { activeId=request.postDataJSON().p_tenant_id; response={tenant_id:activeId,role:'owner'}; }
    else if (url.pathname.endsWith('/tenant_current_permissions')) response=denyPipeline?{companies:true,contacts:true,dashboard:true,inbox:true}: {all:true};
    else if (url.pathname.endsWith('/tenant_effective_modules')) response=['dashboard','companies','contacts','pipeline','inbox','products','quotations','settings','automations','calendar','operations'].map(module_key=>({module_key,enabled:true}));
    else if (url.pathname.endsWith('/platform_current_access')) response={is_platform_admin:false};
    else if (url.pathname.endsWith('/user')) response=user;
    else if (url.pathname.endsWith('/companies')) {
      const id=url.searchParams.get('tenant_id');
      if(request.method()==='POST'){
        companyInsertCount++;const input=request.postDataJSON();
        assert.equal(input.tenant_id,B,'company creation must use selected tenant B');
        createdCompany=input.name;
        response={};
      }else{
        reads.push(id);
        response=[{id:id==='eq.'+B?'company-b':'company-a',name:id==='eq.'+B?'Empresa B':'Empresa A',sector:null,city:null,email:null,phone:null,whatsapp_phone:null,website:null,created_at:new Date().toISOString()},...(createdCompany&&id==='eq.'+B?[{id:'company-qa-created',name:createdCompany,sector:null,city:null,email:null,phone:null,whatsapp_phone:null,website:null,created_at:new Date().toISOString()}]:[])];
      }
    }
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(response),headers:{'access-control-allow-origin':'*','content-range':'0-0/1'}});
  });
  const one = await context.newPage();
  await one.goto(base+'/crm/companies');
  await one.getByRole('heading',{name:'Acceso a tu portal'}).waitFor();
  assert.equal(reads.length,0,'ambiguous tenant must not load company data');
  const two = await context.newPage();
  await two.goto(base+'/crm/companies');
  await two.getByRole('heading',{name:'Acceso a tu portal'}).waitFor();
  await one.getByRole('button',{name:'QA A',exact:true}).click();
  await one.getByText('Empresa A',{exact:true}).waitFor();
  await two.getByText('Empresa A',{exact:true}).waitFor();
  assert.ok(reads.every(id=>id==='eq.'+A),'explicit server selection beats stale localStorage');
  await one.getByRole('button',{name:'+ Nueva empresa'}).click();
  await one.getByLabel('Nombre',{exact:true}).fill('Borrador privado A');
  assert.equal(await two.getByLabel('Empresa activa').count(),0,'client header must not expose a tenant selector');
  // Simulate a server-side tenant change from the authorized agency workflow;
  // the client workspace does not expose a control to do this.
  activeId=B;
  await two.reload();
  await one.reload();
  await two.getByText('Empresa B',{exact:true}).waitFor();
  await one.getByText('Empresa B',{exact:true}).waitFor();
  assert.equal(await one.getByRole('button',{name:'+ Nueva empresa'}).count(),1,'switching tenants closes previous draft');
  await one.getByRole('button',{name:'+ Nueva empresa'}).click();
  assert.equal(await one.getByLabel('Nombre',{exact:true}).inputValue(),'','tenant change discards previous form');
  assert.equal(await one.getByText('Empresa A',{exact:true}).count(),0,'previous tenant rows are removed');
  assert.ok(await one.getByLabel('Empresa de esta sesión').getByText('QA B').isVisible());
  const mobileHeader=await one.locator('.workspace-header').boundingBox();
  assert.ok(mobileHeader&&mobileHeader.height<=90,'tenant identity and mobile menu fit in one compact header');
  await one.locator('.mobile-tenant-navigation summary').click();
  assert.ok(await one.getByRole('navigation',{name:'Otros módulos de QA B'}).getByRole('link',{name:'Cotizaciones'}).isVisible(),'secondary modules are reachable');
  await one.locator('.mobile-tenant-navigation summary').click();
  await one.getByLabel('Nombre',{exact:true}).fill('Empresa nueva QA');
  await one.getByRole('button',{name:'Guardar empresa'}).click();
  await one.getByText('Empresa registrada correctamente.').waitFor();
  await one.getByText('Empresa nueva QA',{exact:true}).waitFor();
  assert.equal(companyInsertCount,1,'mobile save creates exactly one company');
  await one.goto(base+'/crm');
  await one.getByRole('heading',{name:'Portal de QA B'}).waitFor();
  await one.getByRole('link',{name:'Nueva empresa'}).click();
  await one.getByLabel('Nombre',{exact:true}).waitFor();
  const width = await one.evaluate(()=>({scroll:document.documentElement.scrollWidth,viewport:innerWidth}));
  assert.ok(width.scroll <= width.viewport+1, 'mobile page has no horizontal page overflow');
  denyPipeline = true;
  await one.goto(base+'/crm/sales');
  await one.getByRole('heading',{name:'Esta función no está disponible'}).waitFor();
  assert.equal(await one.getByText('Pipeline',{exact:true}).count(),0,'sales alias cannot bypass pipeline permission');
  console.log('PASS: tenant switching, responsive header/menu, mobile company save, dashboard quick action, overflow and sales RBAC gate (controlled API); SQL tenant CRUD validated separately.');
} finally {
  if (browser) await browser.close();
  if (server) server.kill();
}
