import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const root=new URL("../",import.meta.url);
const read=(p)=>readFileSync(new URL(p,root),"utf8");
const view=read("supabase/migrations/20261031160000_lock_platform_client_view.sql");
const privacy=read("supabase/migrations/20261031161000_conversation_privacy_rls.sql");
const sessions=read("supabase/migrations/20261031162000_tenant_access_sessions.sql");
const shortcut=read("components/platform-companies-shortcut.tsx");
const switcher=read("components/tenant-switcher.tsx");
const inbox=read("components/omnichannel-inbox.tsx");
const brand=read("components/tenant-brand-provider.tsx");
const mobile=read("components/mobile-tenant-navigation.tsx");
const gate=read("components/tenant-permission-gate.tsx");
test("platform owner support view is session-locked and company scoped, never a second tenant selector",()=>{
 for(const marker of ["private.crm_client_portal_locks","private.platform_client_view_tenant()",
 "private.crm_is_client_portal_locked()","platform_join_tenant_as_admin",
 "public.set_active_tenant","and private.platform_client_view_tenant()<>p_tenant_id",
 "client_view_locked_until_signout","platform_current_access",
 "public.list_my_tenants","public.tenant_current_permissions"])assert.ok(view.includes(marker),marker);
 assert.ok(shortcut.includes('tenant.tenant_slug!=="eurevector"'));
 assert.doesNotMatch(switcher,/<select\b|set_active_tenant|list_my_tenants/i);
 assert.ok(mobile.includes('tenant.tenant_slug==="eurevector"'));
});
test("no coworker can read or update a human-assigned conversation through REST policies",()=>{
 for(const marker of ["private.crm_can_view_conversation","conversations_select","messages_select",
 "messages_update","messages_insert","messages_delete",
 "p_assigned_to is null","p_assigned_to=(select auth.uid())",
 "private.has_tenant_role(p_tenant_id,array['owner','admin']",
 "crm_guard_non_supervisor_conversation_updates",
 "Only owner/admin may reassign sellers","tenant_assign_conversation"])
 assert.ok(privacy.includes(marker),marker);
 assert.doesNotMatch(inbox,/const isSupervisor = \["owner","admin","manager"\]/);
 assert.ok(inbox.includes("setMessages([]);setMobileThreadOpen(false)"));
});
test("member session activity is based on JWT session and auditable heartbeats, not telemetry guesses",()=>{
 for(const marker of ["auth.jwt()->>'session_id'","tenant_session_heartbeat",
 "tenant_session_end","tenant_session_activity_overview",
 "private.has_tenant_role(p_tenant_id,array['owner','admin']",
 "active_seconds","last_seen_at","ended_at"])assert.ok(sessions.includes(marker),marker);
 assert.ok(gate.includes("tenant_session_heartbeat"));
 assert.ok(mobile.includes("tenant_session_end"));
 assert.ok(read("components/tenant-session-exit.tsx").includes("supabase.auth.signOut"));
 assert.ok(read("components/tenant-session-activity.tsx").includes("aproximadamente cada minuto"));
});
test("customer branding is scoped to the selected tenant and owner link hidden",()=>{
 assert.ok(brand.includes("--tenant-loading-image"));
 assert.ok(read("app/globals.css").includes(".tenant-brand-scope .loading::before"));
 assert.ok(gate.includes('tenant.tenant_slug==="eurevector"'));
 assert.ok(gate.includes("<TenantSessionExit/>"));
});
