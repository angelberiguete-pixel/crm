// Fixture-only browser regression. Live account/RLS tests are separate.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const base = process.env.CRM_BROWSER_TEST_BASE_URL || 'http://127.0.0.1:3169';
const server = process.env.CRM_BROWSER_TEST_BASE_URL ? null : spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', '3169', '-H', '127.0.0.1'], { stdio: ['ignore', 'ignore', 'inherit'] });
let browser;
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try { ready = (await fetch(base + '/login', { signal: AbortSignal.timeout(1000) })).ok; if (ready) break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.ok(ready);
  browser = await chromium.launch({ headless: true, ...(process.env.CRM_TEST_CHROMIUM_PATH ? { executablePath: process.env.CRM_TEST_CHROMIUM_PATH, args: ['--no-sandbox', '--disable-dev-shm-usage'] } : { channel: 'chromium' }) });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const user = { id: '11111111-1111-4111-8111-111111111111', aud: 'authenticated', role: 'authenticated', email: 'qa-admin@example.invalid', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
  const token = [Buffer.from('{}').toString('base64url'), Buffer.from(JSON.stringify({ sub: user.id, role: 'authenticated', exp: Math.floor(Date.now()/1000)+3600 })).toString('base64url'), 'fixture-signature'].join('.');
  let activeId = null;
  const supportEntries = [];
  let delayedAStarted = false;
  const savedRegions = new Map();
  await context.addInitScript(({ user, token }) => localStorage.setItem('sb-ygipjqgyreeahslzorik-auth-token', JSON.stringify({ access_token: token, refresh_token: 'qa-refresh', expires_at: Math.floor(Date.now()/1000)+3600, expires_in: 3600, token_type: 'bearer', user })), { user, token });
  const tenants = [B,A].map((id,i) => ({ tenant_id:id, tenant_name:i?'QA A':'QA B', tenant_slug:'qa-mobile-long-slug-which-used-to-overlap-the-manage-button-'+id, plan_code:'enterprise', member_count:1, created_at:new Date().toISOString() }));
  await context.route('https://ygipjqgyreeahslzorik.supabase.co/**', async route => {
    const request = route.request(), url = new URL(request.url());
    let response = [];
    if (url.pathname.endsWith('/platform_current_access')) response = { is_platform_admin:true };
    else if (url.pathname.endsWith('/platform_admin_tenants')) response = tenants;
    else if (url.pathname.endsWith('/plans')) response = [{id:'plan',code:'enterprise',name:'Scale',monthly_price_cents:80000,is_active:true}];
    else if (url.pathname.endsWith('/platform_admin_tenant_snapshot')) { const id=request.postDataJSON().p_tenant_id; if(id===A){delayedAStarted=true;await new Promise(resolve=>setTimeout(resolve,700));} response={tenant:{id,name:id===A?'QA A':'QA B',slug:'qa'},settings:{brand_name:id===A?'Marca A':'Marca B',primary_color:'#2563eb',country_code:null,currency:'DOP',timezone:'America/Santo_Domingo',locale:'es-DO',...(savedRegions.get(id)??{})},metrics:{companies:1,contacts:0,open_opportunities:0,won_opportunities:0,won_mrr:0,open_mrr:0,conversations:0,products:0}}; }
    else if (url.pathname.endsWith('/platform_update_client_locale')) {const input=request.postDataJSON(); assert.equal(input.p_tenant_id,A,'region edits must use explicitly selected client'); const data={country_code:input.p_country_code,currency:input.p_currency,timezone:input.p_timezone,locale:input.p_locale}; savedRegions.set(A,data);response=data;}
    else if (url.pathname.endsWith('/platform_join_tenant_as_admin')) { activeId=request.postDataJSON().p_tenant_id; supportEntries.push(activeId); response={tenant_id:activeId}; }
    else if (url.pathname.endsWith('/list_my_tenants')) response=tenants.map(t=>({...t,membership_role:'admin',is_active:t.tenant_id===activeId}));
    else if (url.pathname.endsWith('/tenant_current_permissions')) response={all:true};
    else if (url.pathname.endsWith('/tenant_effective_modules')) response=['dashboard','companies'].map(module_key=>({module_key,enabled:true}));
    else if (url.pathname.endsWith('/companies')) response=[{id:'company',name:'Empresa A',created_at:new Date().toISOString()}];
    else if (url.pathname.endsWith('/user')) response=user;
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(response),headers:{'access-control-allow-origin':'*'}});
  });
  const page = await context.newPage();
  await page.goto(base+'/platform-admin');
  await page.getByRole('heading',{name:'LOOK SOCIAL MEDIA · Super Admin'}).waitFor();
  const row=page.getByRole('row').filter({has:page.getByText('QA A',{exact:true})});
  const rowB=page.getByRole('row').filter({has:page.getByText('QA B',{exact:true})});
  await row.getByRole('button',{name:'Gestionar',exact:true}).click();
  for(let i=0;i<60&&!delayedAStarted;i++)await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal(delayedAStarted,true,'QA A request must start before switching');
  await rowB.getByRole('button',{name:'Gestionar',exact:true}).click();
  await page.getByLabel('Marca',{exact:true}).waitFor();
  await page.waitForFunction(()=>document.querySelector('input')!==null);
  await page.getByLabel('Marca',{exact:true}).fill('Marca B');
  await page.waitForTimeout(1000);
  assert.equal(await page.getByLabel('Marca',{exact:true}).inputValue(),'Marca B','late QA A must not overwrite client B branding');
  await row.getByRole('button',{name:'Gestionar',exact:true}).click(); // no force: catches overlapping cells
  await page.getByRole('heading',{name:'QA A',exact:true}).waitFor();
  await page.getByLabel('País (ISO, 2 letras)').fill('DO');
  await page.getByLabel('Moneda (ISO, 3 letras)').fill('DOP');
  await page.getByLabel('Zona horaria (IANA)').fill('America/Santo_Domingo');
  await page.getByLabel('Idioma y región').fill('es-DO');
  await page.getByRole('button',{name:'Guardar región'}).click();
  await page.getByText('País, moneda y zona horaria guardados con auditoría.').waitFor();
  assert.deepEqual(savedRegions.get(A),{country_code:'DO',currency:'DOP',timezone:'America/Santo_Domingo',locale:'es-DO'});
  const size=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,viewport:innerWidth}));
  assert.ok(size.scroll<=size.viewport+1,'Super Admin mobile page does not overflow');
  await page.getByRole('button',{name:'Entrar al CRM',exact:true}).click();
  await page.waitForURL(/\/crm/);
  await page.goto(base+'/crm/companies');
  await page.getByText('Empresa A',{exact:true}).waitFor();
  assert.deepEqual(supportEntries,[A],'support entry uses the explicitly selected client');
  assert.equal(await page.getByLabel('Empresa activa').inputValue(),A);
  console.log('PASS: platform region saved through RPC for selected tenant, mobile Super Admin support entry and delayed A response isolation (stubbed API).');
} finally { if(browser)await browser.close(); if(server)server.kill(); }
