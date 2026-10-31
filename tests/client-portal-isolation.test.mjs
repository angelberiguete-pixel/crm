import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const sql=readFileSync(new URL("../supabase/migrations/20261031170000_client_session_lock_and_agent_private_inbox.sql",import.meta.url),"utf8");
const report=readFileSync(new URL("../supabase/migrations/20261031173000_member_session_reporting.sql",import.meta.url),"utf8");
const gate=readFileSync(new URL("../components/tenant-permission-gate.tsx",import.meta.url),"utf8");
const switcher=readFileSync(new URL("../components/tenant-switcher.tsx",import.meta.url),"utf8");
const mobile=readFileSync(new URL("../components/mobile-tenant-navigation.tsx",import.meta.url),"utf8");
const branded=readFileSync(new URL("../components/tenant-brand-provider.tsx",import.meta.url),"utf8");
const shortcut=readFileSync(new URL("../components/platform-companies-shortcut.tsx",import.meta.url),"utf8");
test("client portal locks real JWT session in database and prevents unauthorized tenant switches",()=>{
 for(const str of ["private.crm_client_portal_locks","auth.jwt()->>'session_id'",
 "crm_lock_client_portal","crm_lock_active_tenant_on_switch",
 "crm_is_client_portal_locked()","not private.crm_is_client_portal_locked()"])
 assert.ok(sql.includes(str),str);
 assert.ok(gate.includes('supabase.rpc("crm_lock_client_portal"'));
 assert.ok(!switcher.includes("<select"));
 assert.ok(mobile.includes('crm_member_session_close'));
});
test("vendors cannot select peers' assigned conversation or thread messages",()=>{
 for(const str of ["private.crm_can_view_conversation(tenant_id,id)",
  "private.crm_can_view_conversation(tenant_id,conversation_id)",
  "c.assigned_to=auth.uid()","c.assigned_to is null","c.metadata->>'routing_mode'='ai'",
  "m.role='agent'","m.role in ('owner','admin','manager')","messages_insert"])
   assert.ok(sql.includes(str),str);
 assert.doesNotMatch(sql,/using\\(private.has_tenant_access\\(tenant_id\\)\\)/);
});
test("session reporting is restricted to actual owner/admin of active company",()=>{
 assert.ok(report.includes("m.role in ('owner','admin')"));
 assert.ok(report.includes("private.crm_active_tenant_matches(p_tenant_id)"));
 assert.ok(report.includes("auth.users"));
 assert.ok(sql.includes("crm_member_session_heartbeat"));
 assert.ok(sql.includes("signed_out_at"));
});
test("client workspace never renders global owner shortcut and shows company-specific loading identity",()=>{
 assert.ok(!gate.includes("<PlatformCompaniesShortcut"));
 assert.ok(shortcut.includes('tenant?.tenant_slug!=="eurevector"'));
 assert.ok(!mobile.includes("<PlatformCompaniesShortcut"));
 assert.ok(branded.includes("/client-brands/family-power/logo-negativo-sin-fondo.svg"));
 assert.ok(gate.includes("tenant-gate-loading"));
});
