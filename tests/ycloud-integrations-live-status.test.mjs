import {test} from "node:test";import assert from "node:assert/strict";import {readFileSync} from "node:fs";
const sql=readFileSync(new URL("../supabase/migrations/20261031140000_ycloud_admin_connection_overview.sql",import.meta.url),"utf8");
const ui=readFileSync(new URL("../components/crm-integration-center.tsx",import.meta.url),"utf8");
test("YCloud admin RPC validates tenant and hides secrets",()=>{
 for(const s of ["private.crm_is_tenant_admin(p_tenant_id)","private.crm_is_platform_admin()",
  "auth.uid() is null","tenant_id=p_tenant_id","r.is_enabled","revoke all on function public.tenant_ycloud_connection_status(uuid)"])
   assert.ok(sql.includes(s),s);
 assert.doesNotMatch(sql,/apikey|secret|token|customerProfile|message_body/i);
});
test("integration UI displays real YCloud route status and public receiver without enabling sends",()=>{
 for(const s of ["tenant_ycloud_connection_status","ycloud-whatsapp-inbound",
  "whatsapp.inbound_message.received","whatsapp.message.updated","Sin rutas YCloud autorizadas"])
   assert.ok(ui.includes(s),s);
 assert.doesNotMatch(ui,/YCLOUD_API_KEY|YCLOUD_WEBHOOK_SECRET/);
});
