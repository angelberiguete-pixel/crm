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
});
