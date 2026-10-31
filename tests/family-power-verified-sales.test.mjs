
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const migration=readFileSync("supabase/migrations/20261031151500_family_power_verified_sales.sql","utf8");
const routes=readFileSync("app/crm/[[...slug]]/page.tsx","utf8");
const gate=readFileSync("components/tenant-permission-gate.tsx","utf8");
const ui=readFileSync("components/family-power-launch-center.tsx","utf8");

test("Family Power sales have explicit owner/admin server-side authority and private evidence",()=>{
  assert.match(migration,/private\.crm_is_tenant_admin\(p_tenant_id\)/);
  assert.match(migration,/t\.slug='family-power'/);
  for(const table of ["crm_family_product_approvals","crm_family_payment_receipts","crm_family_purchase_outbox"]){
    assert.match(migration,new RegExp("alter table public\\."+table+" enable row level security"));
    assert.match(migration,new RegExp("revoke all on public\\."+table+" from public,anon,authenticated"));
  }
  assert.match(migration,/f\.status='ready'/);
  assert.match(migration,/f\.mime_type='application\/pdf'/);
});
test("only an accepted quote and bank-verified full payment can create a sale",()=>{
  assert.match(migration,/q\.status='accepted'/);
  assert.match(migration,/if v_receipt\.status<>'pending'/);
  assert.match(migration,/p_bank_reference is null/);
  assert.match(migration,/if v_paid>v_order\.total/);
  assert.match(migration,/if p_confirmed and v_paid>=v_order\.total/);
  assert.match(migration,/delivery_state text not null default 'held'/);
  assert.match(migration,/on conflict\(tenant_id,order_id\) do nothing/);
  assert.doesNotMatch(migration,/https:\/\/graph\.facebook\.com/);
});
test("product approval invalidates on price, stock or SKU changes",()=>{
  assert.match(migration,/crm_family_invalidate_product_approval/);
  assert.match(migration,/old\.sale_price is distinct from new\.sale_price/);
  assert.match(migration,/old\.stock_snapshot is distinct from new\.stock_snapshot/);
  assert.match(migration,/old\.sku is distinct from new\.sku/);
});
test("family power setup route stays under authenticated tenant permission gate",()=>{
  assert.match(routes,/family-power-setup/);
  assert.match(gate,/"family-power-setup": "settings"/);
  assert.match(ui,/tenant\?\.tenant_slug==="family-power"/);
  assert.match(ui,/\["owner","admin"\]/);
  assert.match(ui,/La IA no puede confirmar pagos/);
});

test("PDF quotation is built only from tenant-scoped real quote and line items",()=>{
  const doc=readFileSync("components/family-power-quote-document.tsx","utf8");
  assert.match(doc,/from\("quotations"\)/);
  assert.match(doc,/from\("quotation_items"\)/);
  assert.match(doc,/\.eq\("tenant_id",tenantId\)/);
  assert.match(doc,/items\.length>0/);
  assert.match(doc,/quote\.status==="draft"/);
  assert.match(doc,/window\.print\(\)/);
});
test("inbox refresh uses RLS and tenant-scoped visible-tab polling until realtime is authorized",()=>{
 const source=readFileSync("components/omnichannel-inbox.tsx","utf8");
 assert.match(source,/document\.visibilityState!=="visible"/);
 assert.match(source,/window\.setInterval\(\(\)=>void refreshVisible\(\),8000\)/);
 assert.match(source,/\.eq\("tenant_id",tenantId\)\.eq\("conversation_id",selectedId\)/);
 assert.match(source,/if\(c\.error\)\{setConversations\(\[\]\);setMessages\(\[\]\);setSelectedId\(null\)/);
});
