import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync } from 'node:fs';

// Explicit opt-in, disposable local PostgreSQL only. Never uses a Supabase URL.
const enabled=process.env.ERP_POSTGRES_TESTS==='1';
const container='empresia-erp-test',database='erp_native_ci';
const env={...process.env};
for(const key of ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH'])delete env[key];
const base=['--host=unix:///var/run/docker.sock','exec','-i',container,'psql','-X','-q','-A','-t','-U','postgres','-v','ON_ERROR_STOP=1'];
const file=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const run=(sql,db=database)=>execFileSync('docker',[...base,'-d',db],{input:sql,encoding:'utf8',env,stdio:['pipe','pipe','pipe']}).trim();
const asyncExec=promisify(execFile);
const user='91000000-0000-4000-8000-000000000001';
const tenant='92000000-0000-4000-8000-000000000001';
const asUser=sql=>`set role authenticated; set request.jwt.claims='{"sub":"${user}","role":"authenticated"}'; ${sql}`;
const migrationFiles=[
  'supabase/migrations/20261111050723_erp_native_inventory_transactions.sql',
  'supabase/migrations/20261111050740_erp_native_purchasing.sql',
  'supabase/migrations/20261111050743_erp_native_commercial_sales.sql',
  'supabase/migrations/20261111052948_erp_native_order_fulfillment.sql',
];

test('native ERP on disposable PostgreSQL 17', {skip:!enabled}, async t=>{
  // The container must be the isolated test container, never a database supplied by URL.
  const image=execFileSync('docker',['--host=unix:///var/run/docker.sock','inspect','--format','{{.Config.Image}}',container],{encoding:'utf8',env}).trim();
  assert.match(image,/^postgres:17(?:\.|$)/);
  run(`drop database if exists ${database} with (force); create database ${database};`,'postgres');
  run(file('tests/fixtures/erp-native-baseline.sql'));
  for(const path of migrationFiles)run(file(path));

  await t.test('recovered inventory SQL regression',()=>run(file('tests/erp-native-inventory-postgres.sql')));
  await t.test('recovered purchasing SQL regression',()=>run(file('tests/erp-native-purchasing-postgres.sql')));
  await t.test('recovered commercial sales SQL regression',()=>run(file('tests/erp-native-sales-postgres.sql')));
  await t.test('order allocations, protected reservations and atomic delivery',()=>run(file('tests/erp-native-order-inventory-postgres.sql')));

  run(`insert into auth.users(id) values('${user}');
    insert into public.tenants(id,name,slug,owner_user_id) values('${tenant}','Synthetic concurrency','synthetic-concurrency','${user}');
    insert into public.memberships(tenant_id,user_id,role,status) values('${tenant}','${user}','owner','active');
    insert into private.user_active_tenants(user_id,tenant_id) values('${user}','${tenant}');`);
  const item=JSON.parse(run(asUser(`select public.erp_inventory_item_save('${tenant}',null,'{"sku":"CONCURRENT","name":"Synthetic concurrency"}','ci:create');`))).id;
  run(asUser(`select public.erp_inventory_move('${tenant}','${item}','entry',10,'ci:opening');`));
  const racing=async(key,quantity,type='exit')=>{
    const query=asUser(`begin; select public.erp_inventory_move('${tenant}','${item}','${type}',${quantity},'${key}'); select pg_sleep(0.15); commit;`);
    return asyncExec('docker',[...base,'-d',database,'-c',query],{encoding:'utf8',env});
  };
  await t.test('concurrent withdrawals cannot overspend stock',async()=>{
    const results=await Promise.allSettled([racing('ci:exit-a',7),racing('ci:exit-b',7)]);
    assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
    assert.match(results.find(x=>x.status==='rejected').reason.stderr,/insufficient_stock/);
    assert.equal(run(`select on_hand from public.inventory_items where id='${item}';`),'3');
    assert.equal(run(`select count(*) from public.inventory_movements where inventory_item_id='${item}';`),'2');
  });
  await t.test('concurrent retries record exactly one movement',async()=>{
    const results=await Promise.allSettled([racing('ci:same',2,'entry'),racing('ci:same',2,'entry')]);
    assert.equal(results.filter(x=>x.status==='fulfilled').length,2);
    assert.equal(run(`select on_hand from public.inventory_items where id='${item}';`),'5');
    assert.equal(run(`select count(*) from public.inventory_operations where tenant_id='${tenant}' and idempotency_key='ci:same';`),'1');
    assert.equal(run(`select count(*) from public.inventory_movements where inventory_item_id='${item}';`),'3');
  });
  const product='93000000-0000-4000-8000-000000000001';
  const orderA='94000000-0000-4000-8000-000000000001',orderB='94000000-0000-4000-8000-000000000002';
  run(`insert into public.products(id,tenant_id,sku,name) values('${product}','${tenant}','CI-ORDER','Synthetic order product');
    update public.inventory_items set product_id='${product}' where id='${item}';
    insert into public.orders(id,tenant_id,order_number) values('${orderA}','${tenant}','CI-ORDER-A'),('${orderB}','${tenant}','CI-ORDER-B');
    insert into public.order_items(tenant_id,order_id,product_id,description,quantity) values
      ('${tenant}','${orderA}','${product}','Synthetic A',3),('${tenant}','${orderB}','${product}','Synthetic B',3);`);
  const orderRace=(order,action,key)=>asyncExec('docker',[...base,'-d',database,'-c',asUser(`begin; select public.erp_order_inventory_command('${tenant}','${order}','${action}','${key}'); select pg_sleep(0.15); commit;`)],{encoding:'utf8',env});
  let reservedOrder;
  await t.test('two orders cannot reserve the same available units',async()=>{
    const results=await Promise.allSettled([orderRace(orderA,'reserve','ci:allocate-a'),orderRace(orderB,'reserve','ci:allocate-b')]);
    assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
    assert.match(results.find(x=>x.status==='rejected').reason.stderr,/insufficient_stock/);
    assert.equal(run(`select reserved from public.inventory_items where id='${item}';`),'3');
    assert.equal(run(`select count(*) from public.order_inventory_allocations where inventory_item_id='${item}' and reserved_quantity=3;`),'1');
    reservedOrder=run(`select order_id from public.order_inventory_allocations where inventory_item_id='${item}' and reserved_quantity=3;`);
  });
  let shipmentKey;
  await t.test('concurrent delivery confirmations consume order stock once',async()=>{
    assert.ok(reservedOrder);
    run(`update public.orders set status='ready_for_delivery' where id='${reservedOrder}';
      insert into public.production_jobs(tenant_id,order_id,status,design_approved,quality_control_status)
        values('${tenant}','${reservedOrder}','completed',true,'passed');`);
    const results=await Promise.allSettled([orderRace(reservedOrder,'ship','ci:ship-a'),orderRace(reservedOrder,'ship','ci:ship-b')]);
    assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
    assert.match(results.find(x=>x.status==='rejected').reason.stderr,/order_already_delivered/);
    shipmentKey=results[0].status==='fulfilled'?'ci:ship-a':'ci:ship-b';
    assert.equal(run(`select on_hand||':'||reserved from public.inventory_items where id='${item}';`),'2:0');
    assert.equal(run(`select count(*) from public.inventory_movements where order_id='${reservedOrder}' and movement_type='consume';`),'1');
    assert.equal(run(`select count(*) from public.deliveries where order_id='${reservedOrder}' and status='delivered';`),'1');
  });
  await t.test('delivery retries replay the same committed result',async()=>{
    const results=await Promise.all([orderRace(reservedOrder,'ship',shipmentKey),orderRace(reservedOrder,'ship',shipmentKey)]);
    assert.equal(results.length,2);
    assert.equal(run(`select on_hand from public.inventory_items where id='${item}';`),'2');
    assert.equal(run(`select count(*) from public.inventory_movements where order_id='${reservedOrder}' and movement_type='consume';`),'1');
  });
  await t.test('reverse-input purchase creation cannot deadlock a receipt holding the first item',async()=>{
    const supplier=JSON.parse(run(asUser(`select public.erp_purchase_command('${tenant}','supplier_save','{"name":"Synthetic lock supplier"}','ci:lock-supplier');`))).supplier.id;
    const second=JSON.parse(run(asUser(`select public.erp_inventory_item_save('${tenant}',null,'{"sku":"CI-LOCK-SECOND","name":"Synthetic second item"}','ci:lock-item');`))).id;
    const sorted=[item,second].sort(),line=id=>({inventory_item_id:id,quantity:'1',unit_cost:'1'});
    const orderPayload=JSON.stringify({supplier_id:supplier,currency:'DOP',lines:sorted.map(line)});
    const po=JSON.parse(run(asUser(`select public.erp_purchase_command('${tenant}','order_create','${orderPayload}','ci:lock-po');`)));
    run(asUser(`select public.erp_purchase_command('${tenant}','order_approve','{"order_id":"${po.order.id}"}','ci:lock-approve');`));
    const receipt=JSON.stringify({order_id:po.order.id,reference:'SYNTHETIC-LOCK-RECEIPT',lines:po.lines.map(row=>({order_item_id:row.id,quantity:'1'}))});
    // Pre-lock as the test DB owner to pause inside the definer's lock hierarchy.
    // Authenticated clients deliberately have no direct UPDATE/row-lock grant.
    const reception=asyncExec('docker',[...base,'-d',database,'-c',`begin; select id from public.inventory_items where id='${sorted[0]}' for update; select pg_advisory_xact_lock(812603); select pg_sleep(2); ${asUser(`select public.erp_purchase_command('${tenant}','receive','${receipt}','ci:lock-receive');`)} commit;`],{encoding:'utf8',env});
    reception.catch(()=>{}); // Report through Promise.all, never as an unhandled rejection while polling.
    let observed=false;
    for(let attempt=0;attempt<20;attempt++){
      observed=run("select count(*) from pg_locks where locktype='advisory' and objid=812603 and granted;")==='1';
      if(observed)break;await new Promise(resolve=>setTimeout(resolve,20));
    }
    assert.ok(observed,'receipt reached its first-item lock before starting the other writer');
    const reverse=JSON.stringify({supplier_id:supplier,currency:'DOP',lines:[...sorted].reverse().map(line)});
    const creation=asyncExec('docker',[...base,'-d',database,'-c',asUser(`select public.erp_purchase_command('${tenant}','order_create','${reverse}','ci:lock-create-reverse');`)],{encoding:'utf8',env});
    await Promise.all([reception,creation]);
    assert.equal(run(`select amount_due from public.supplier_payables where purchase_order_id='${po.order.id}';`),'2.00');
  });
  await t.test('fulfillment refuses destructive rollback after use',()=>{
    assert.throws(()=>run(file('supabase/rollback/20261111052948_erp_native_order_fulfillment.sql')),/rollback_refused_fulfillment_already_used/);
  });
  await t.test('fulfillment pre-use rollback preserves the prior inventory schema',()=>{
    const rollbackDatabase='erp_native_rollback_fulfillment';
    run(`drop database if exists ${rollbackDatabase} with (force); create database ${rollbackDatabase};`,'postgres');
    run(file('tests/fixtures/erp-native-baseline.sql'),rollbackDatabase);
    for(const path of migrationFiles)run(file(path),rollbackDatabase);
    run(file('supabase/rollback/20261111052948_erp_native_order_fulfillment.sql'),rollbackDatabase);
    assert.equal(run("select (to_regclass('public.order_inventory_allocations') is null) and (to_regclass('public.inventory_operations') is not null);",rollbackDatabase),'t');
  });
});
