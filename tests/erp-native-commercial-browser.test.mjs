// Controlled browser fixtures only. All Supabase calls are intercepted; never
// point this test at production and never use real credentials or payments.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const base=process.env.CRM_BROWSER_TEST_BASE_URL||'http://127.0.0.1:3176';
assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname),'only a local fixture server is allowed');
const server=process.env.CRM_BROWSER_TEST_BASE_URL?null:spawn(process.execPath,['node_modules/next/dist/bin/next','start','-p','3176','-H','127.0.0.1'],{stdio:['ignore','ignore','inherit']});
let browser,page;
const A='aabb0000-0000-4000-8000-000000000001',B='aabb0000-0000-4000-8000-000000000002';
const orderId='aacc0000-0000-4000-8000-000000000001',invoiceId='aadd0000-0000-4000-8000-000000000001';
const user={id:'aaee0000-0000-4000-8000-000000000001',aud:'authenticated',role:'authenticated',email:'synthetic@example.invalid',app_metadata:{},user_metadata:{},created_at:'2026-01-01T00:00:00Z'};
const token=[Buffer.from('{}').toString('base64url'),Buffer.from(JSON.stringify({sub:user.id,role:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url'),'synthetic-signature'].join('.');
const calls=[],paymentCalls=[],errors=[];
let active=A,invoices=[],paid='0.00',status='ready_for_delivery';
try{
 let ready=false;
 for(let i=0;i<60;i++){try{ready=(await fetch(base+'/login',{signal:AbortSignal.timeout(1000)})).ok;if(ready)break;}catch{}await new Promise(resolve=>setTimeout(resolve,250));}
 assert.ok(ready,'local server ready');
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,acceptDownloads:true});
 await context.addInitScript(({user,token})=>localStorage.setItem('sb-ygipjqgyreeahslzorik-auth-token',JSON.stringify({access_token:token,refresh_token:'synthetic-refresh',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user})),{user,token});
 await context.route('https://ygipjqgyreeahslzorik.supabase.co/**',async route=>{
  const request=route.request(),url=new URL(request.url()),path=url.pathname;let response=[];
  if(path.endsWith('/user'))response=user;
  else if(path.endsWith('/list_my_tenants'))response=[A,B].map((id,index)=>({tenant_id:id,tenant_name:index?'Synthetic B':'Synthetic A',tenant_slug:index?'synthetic-b':'synthetic-a',membership_role:'owner',is_active:active===id}));
  else if(path.endsWith('/set_active_tenant')){active=request.postDataJSON().p_tenant_id;response={tenant_id:active,role:'owner'};}
  else if(path.endsWith('/tenant_current_permissions'))response={all:true};
  else if(path.endsWith('/tenant_effective_modules'))response=['dashboard','operations','products','quotations','settings'].map(module_key=>({module_key,enabled:true}));
  else if(path.endsWith('/platform_current_access'))response={is_platform_admin:false};
  else if(path.endsWith('/orders')){
   assert.equal(request.method(),'GET','no direct order paid/delivered writes');
   assert.ok(url.searchParams.get('select').includes('total::text'),'money cast on server');
   response=url.searchParams.get('tenant_id')==='eq.'+A?[{id:orderId,order_number:'SYNTHETIC-ORDER',quotation_id:null,contact_id:null,status,currency:'USD',total:'100.10',amount_paid:paid,committed_at:null,created_at:'2026-11-11T00:00:00Z'}]:[];
  }else if(path.endsWith('/production_jobs'))response=url.searchParams.get('tenant_id')==='eq.'+A?[{id:'synthetic-job',order_id:orderId,status:'completed',priority:3,technique:null,design_approved:true,quality_control_status:'passed'}]:[];
  else if(path.endsWith('/deliveries')){assert.equal(request.method(),'GET','delivery mutation must use transaction');response=url.searchParams.get('tenant_id')==='eq.'+A?[{id:'synthetic-delivery',order_id:orderId,status:status==='delivered'?'delivered':'pending',shipping_cost:null,scheduled_at:null}]:[];}
  else if(path.endsWith('/tenant_settings'))response={brand_name:active===A?'Synthetic A':'Synthetic B',currency:'USD',timezone:'UTC'};
  else if(path.endsWith('/inventory_warehouses'))response=[];
  else if(path.endsWith('/commercial_invoice_balances')){assert.equal(request.method(),'GET');assert.ok(url.searchParams.get('select').includes('outstanding::text'));response=url.searchParams.get('tenant_id')==='eq.'+A?invoices:[];}
  else if(path.endsWith('/erp_native_issue_invoice')){
   const payload=request.postDataJSON();calls.push({action:'invoice',payload});assert.equal(payload.p_tenant_id,A);assert.equal(payload.p_order_id,orderId);assert.ok(payload.p_idempotency_key);
   invoices=[{id:invoiceId,tenant_id:A,order_id:orderId,invoice_number:'FC-SYNTHETIC-USD',currency:'USD',subtotal:'100.10',discount_total:'0.00',tax_total:'0.00',total:'100.10',amount_paid:'0.00',outstanding:'100.10',issued_at:'2026-11-11T00:00:00Z',due_date:payload.p_due_date,overdue:false,customer_snapshot:{name:'Synthetic Buyer'},lines_snapshot:[{description:'Synthetic product',quantity:'1',unit_price:'100.10',line_total:'100.10'}]}];response=invoiceId;
  }else if(path.endsWith('/erp_native_record_payment')){
   const payload=request.postDataJSON();paymentCalls.push(payload);assert.equal(payload.p_tenant_id,A);assert.equal(payload.p_currency,'USD');assert.equal(payload.p_amount,'30.03');assert.equal(payload.p_human_confirmed,true);
   if(paymentCalls.length===1){await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'temporary failure',code:'TEMPORARY'})});return;}
   assert.equal(payload.p_idempotency_key,paymentCalls[0].p_idempotency_key,'retry retains payload key');
   paid='30.03';invoices=invoices.map(invoice=>({...invoice,amount_paid:paid,outstanding:'70.07'}));response='synthetic-payment';
  }else if(path.endsWith('/erp_order_inventory_command')){
   const payload=request.postDataJSON();calls.push({action:payload.p_action,payload});assert.equal(payload.p_tenant_id,A);assert.equal(payload.p_order_id,orderId);assert.ok(payload.p_idempotency_key);
   if(payload.p_action==='ship')status='delivered';response={order_id:orderId,action:payload.p_action};
  }else if(path.endsWith('/customer_payments'))throw Error('direct payment access is not part of this flow');
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(response),headers:{'access-control-allow-origin':'*'}});
 });
 page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
 await page.goto(base+'/crm/operations');await page.getByRole('heading',{name:'Facturas y cuentas por cobrar',exact:true}).waitFor();
 const issueForm=page.locator('form').filter({has:page.getByRole('heading',{name:'Emitir factura comercial',exact:true})});
 await issueForm.getByRole('combobox').selectOption(orderId);await issueForm.getByLabel('Vencimiento').fill('2026-12-01');
 await issueForm.getByRole('button',{name:'Emitir factura comercial',exact:true}).click();
 await page.getByText('FC-SYNTHETIC-USD',{exact:true}).waitFor();
 const paymentForm=page.locator('form').filter({has:page.getByRole('heading',{name:'Registrar cobro recibido',exact:true})});
 await paymentForm.getByRole('combobox',{name:/^Factura/}).selectOption(invoiceId);
 await paymentForm.getByLabel('Importe en la moneda de la factura').fill('30.03');await paymentForm.getByLabel('Referencia comprobable').fill('SYNTHETIC-EVIDENCE-1');
 const payButton=paymentForm.getByRole('button',{name:'Registrar cobro recibido',exact:true});assert.equal(await payButton.isDisabled(),true);assert.equal(paymentCalls.length,0);
 await paymentForm.getByRole('checkbox').check();await payButton.click();
 await page.getByRole('alert').filter({hasText:'No se pudo confirmar'}).waitFor();assert.equal(paymentCalls.length,1);
 await payButton.click();await page.getByText('Cobrado USD 30.03 · Pendiente USD 70.07',{exact:true}).waitFor();assert.equal(paymentCalls.length,2);
 const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Descargar PDF',exact:true}).click();const download=await downloadPromise;
 assert.match(download.suggestedFilename(),/\.pdf$/);const pdf=await readFile(await download.path());assert.ok(pdf.subarray(0,8).toString().startsWith('%PDF-1.4'));
 await page.getByRole('button',{name:'Reservar existencias',exact:true}).click();await page.getByText('Existencias reservadas para este pedido.',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Confirmar entrega',exact:true}).click();await page.getByText('Entrega confirmada: inventario, reservas y pedido actualizados juntos.',{exact:true}).waitFor();
 assert.deepEqual(calls.map(call=>call.action),['invoice','reserve','ship']);
 const width=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,viewport:innerWidth}));assert.ok(width.scroll<=width.viewport+1,'390px mobile has no page overflow');
 await page.getByLabel('Empresa activa').selectOption(B);
 await page.getByText('No hay facturas comerciales registradas.',{exact:true}).waitFor();assert.equal(await page.getByText('FC-SYNTHETIC-USD',{exact:true}).count(),0,'tenant switch removes invoice A');
 await page.setViewportSize({width:1440,height:1000});assert.equal(await page.getByRole('button',{name:'Registrar cobro recibido',exact:true}).count(),0);
 assert.deepEqual(errors,[]);
 console.log('PASS: native invoice issuance, decimal partial payment, human confirmation, idempotent retry, PDF, reserve/delivery RPCs, mobile layout and tenant reset (controlled API only).');
}catch(error){if(page){console.error(await page.locator('body').innerText());await page.screenshot({path:'/workspace/scratch/erp-commercial-browser-failure.png',fullPage:true}).catch(()=>{});}throw error;
}finally{if(browser)await browser.close();if(server)server.kill();}
