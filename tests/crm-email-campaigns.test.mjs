import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(path, import.meta.url), "utf8");
const sql = read("../supabase/migrations/20261109065000_marketing_email_campaigns.sql");
const ui = read("../components/crm-email-campaigns.tsx");
const routes = read("../app/crm/[[...slug]]/page.tsx");
const gate = read("../components/tenant-permission-gate.tsx");
const mobile = read("../components/mobile-tenant-navigation.tsx");

test("mailing lists stay within an authenticated tenant and contact source-of-truth", () => {
  for (const table of ["marketing_email_campaigns","marketing_email_consents","marketing_email_events"]) {
    assert.ok(sql.includes("alter table public." + table + " enable row level security"), table);
    assert.ok(sql.includes("revoke all on public." + table + " from public,anon,authenticated"), table);
  }
  assert.match(sql, /private\.crm_is_tenant_admin\(tenant_id\)/);
  assert.match(sql, /c\.id=new\.contact_id and c\.tenant_id=new\.tenant_id/);
  assert.match(ui, /\.eq\("tenant_id", tenantId\)/);
  assert.match(gate, /email: "settings"/);
  assert.match(gate, /restrictedFamilySections=\[[^\]]*"email"/);
});

test("mail campaign editing cannot turn a draft into a send", () => {
  assert.match(sql, /status='draft' and provider_campaign_id is null/);
  assert.match(sql, /marketing_email_campaign_admin_edit_drafts/);
  assert.match(ui, /No se envió ningún correo/);
  assert.match(ui, /Envío masivo: desactivado/);
  assert.doesNotMatch(ui, /sendNow|sendEmailCampaign|\/v3\/emailCampaigns|smtp\/email/);
  assert.match(routes, /section === "email"/);
  assert.match(mobile, /Campañas email/);
});

test("consent evidence and suppression status are required and cannot be guessed", () => {
  for (const marker of ["'opted_in'","'opted_out'","'bounced'","'complained'","verified_at is not null",
    "char_length(btrim(evidence))>=8"]) assert.ok(sql.includes(marker), marker);
  assert.match(ui, /evidencia comprobable/);
  assert.match(sql, /s\.status='opted_in'/);
  assert.match(sql, /status in \('opted_out','bounced','complained'\)/);
});

test("email performance only counts recorded provider events", () => {
  assert.match(sql, /revoke all on public\.marketing_email_events from public,anon,authenticated/);
  assert.match(sql, /'provider_connected',false/);
  assert.match(sql, /'sending_enabled',false/);
  for(const k of ["delivered","opened","clicked","bounced","replied"])
    assert.match(sql, new RegExp("event_type='"+k+"'"));
  assert.match(ui, /Una apertura no prueba que el mensaje fue leído/);
});

test("preferred Gmail accounts are tenant-scoped metadata, not a mail transport", () => {
  const senderSql = read("../supabase/migrations/20261109073000_marketing_email_sender_preferences.sql");
  const labels = read("../components/crm-email-campaigns.tsx");
  assert.match(senderSql, /marketing_email_sender_preferences enable row level security/);
  assert.match(senderSql, /revoke all on public\.marketing_email_sender_preferences from public,anon,authenticated/);
  assert.match(senderSql, /private\.crm_is_tenant_admin\(tenant_id\)/);
  assert.match(senderSql, /delivery_status='not_connected'/);
  assert.match(senderSql, /sends_enabled=false/);
  assert.match(labels, /Correos comerciales seleccionados/);
  assert.match(labels, /no significa que Gmail esté conectado a Empresia/);
  assert.match(labels, /no se alternarán para aumentar límites/);
  assert.match(labels, /\.eq\("tenant_id", tenantId\)\.maybeSingle\(\)/);
});
