import assert from "node:assert/strict";
import {test} from "node:test";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const sql=read("supabase/migrations/20261111173000_empresia_dual_erp_single_writer.sql");
const ui=read("components/erp-dual-engine-status.tsx");
const overview=read("components/empresia-erp-overview.tsx");

test("three ERP runtimes use one Empresia canonical source, external systems never own transactional data",()=>{
 assert.match(sql,/canonical_system text not null default 'empresia' check\(canonical_system='empresia'\)/);
 for(const type of ["contacts","products","inventory","orders","purchases","invoices","payments","accounting","installations","documents"])
  assert.ok(sql.includes("'"+type+"'"),type);
 assert.match(sql,/sync_mode in \('disabled','observe','mirror'\)/);
 assert.match(sql,/sync_mode='disabled' or \(approved_by is not null and approved_at is not null\)/);
 assert.match(sql,/check\(provider in \('odoo','dolibarr'\)\)/);
 assert.match(sql,/unique\(tenant_id,provider,domain,canonical_id\)/);
 assert.match(sql,/unique\(tenant_id,provider,domain,external_model,external_id\)/);
 assert.match(sql,/c.tenant_id=new.tenant_id and c.provider=new.provider/);
});

test("dual-engine events remain disabled until tenant is explicitly enrolled; no raw money, names or credentials",()=>{
 assert.match(sql,/private.erp_dual_tenant_enrollments/);
 assert.match(sql,/enabled boolean not null default false/);
 assert.match(sql,/where e.tenant_id=new.tenant_id and e.enabled=true/);
 assert.match(sql,/on conflict\(tenant_id,event_key\) do nothing/);
 for(const table of ["orders","inventory_movements","customer_payments"])assert.ok(sql.includes("on public."+table));
 assert.match(sql,/jsonb_build_object\('source_table',tg_table_name,'source_id',v_id,'event',v_kind\)/);
 assert.doesNotMatch(sql,/jsonb_build_object\('.*customer_name|new\.api_key|new\.phone|new\.amount/);
});

test("legacy Odoo bidirectional sync cannot alter canonical domains for enrolled tenant",()=>{
 assert.match(sql,/private.erp_dual_protect_existing_jobs/);
 assert.match(sql,/new.job_type in \('push','pull','full_sync'\)/);
 assert.match(sql,/erp_canonical_domain_locked_for_dual_engine/);
 assert.match(sql,/erp_dual_sync_job_guard before insert or update/);
 assert.match(sql,/erp_dual_external_id_guard/);
});

test("RLS denies browser writes; policies require active tenant and privileged role",()=>{
 for(const table of ["erp_dual_domain_policy","erp_dual_external_ids","erp_dual_outbox"]){
  assert.ok(sql.includes("alter table public."+table+" enable row level security"));
 }
 assert.match(sql,/revoke all on public.erp_dual_domain_policy,public.erp_dual_external_ids/);
 assert.match(sql,/private.crm_active_tenant_matches\(tenant_id\)/);
 assert.match(sql,/private.has_tenant_role\(tenant_id,array\['owner','admin'\]::text\[\]\)/);
 assert.match(sql,/with \(security_invoker=true\)/);
 assert.match(sql,/erp_dual_connection_status/);
});

test("public ERP does not claim nonexistent servers; privileged Empresia only",()=>{
 assert.match(overview,/tenant.tenant_slug==="eurevector"/);
 assert.match(overview,/<ErpDualEngineStatus\/>/);
 assert.match(ui,/tenant\?\.tenant_slug==="eurevector"/);
 assert.match(ui,/\["owner","admin"\]/);
 assert.match(ui,/\.eq\("tenant_id",tenantId\)/);
 assert.match(ui,/Sin conexión registrada/);
 assert.match(ui,/El motor no está configurado aún para Empresia/);
 assert.match(ui,/Conexión no verificada/);
 assert.match(ui,/no simula servidores, facturas ni balances/);
 assert.doesNotMatch(ui,/DOLIBARR_API_KEY|SUPABASE_SERVICE_ROLE_KEY|ODOO_API_KEY/);
});

test("Odoo 20 onboarding cannot silently convert Empresia into an Odoo-owned ERP",()=>{
 const onboarding=read("supabase/functions/platform-odoo-onboarding/index.ts");
 assert.match(sql,/erp_dual_connection_authority_guard/);
 assert.match(sql,/erp_dual_bidirectional_sync_forbidden/);
 assert.match(sql,/erp_external_canonical_owner_forbidden/);
 assert.match(sql,/t.slug='eurevector'/);
 assert.match(onboarding,/const empresiaCanonical=tenantLookup.data.slug==="eurevector"/);
 assert.match(onboarding,/p_sync_direction:empresiaCanonical\?"crm_to_erp":"bidirectional"/);
 assert.match(onboarding,/if\(authenticated&&!empresiaCanonical\)/);
 assert.match(onboarding,/canonical_source:empresiaCanonical\?"empresia":"legacy_tenant_policy"/);
});
