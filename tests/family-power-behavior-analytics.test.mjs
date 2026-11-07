import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = path => readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("Family Power event dashboard is tenant guarded and reads only aggregated RPC",()=>{
 const component=read("components/family-power-behavior-dashboard.tsx");
 const route=read("components/crm-web-analytics.tsx");
 const sql=read("supabase/migrations/20261107110000_family_power_behavior_telemetry.sql");
 assert.match(component,/tenant\?\.tenant_slug==="family-power"/);
 assert.match(component,/marketing_behavior_overview/);
 assert.match(route,/<FamilyPowerBehaviorDashboard\/>/);
 assert.match(sql,/private\.crm_is_tenant_admin\(p_tenant_id\)/);
 assert.match(sql,/revoke all on public\.marketing_behavior_events from public,anon,authenticated/);
 assert.match(sql,/check_behavior_site_tenant/);
});
test("Tracking is consent gated, does not fingerprint or capture typed form values",()=>{
 const source=read("app/api/family-power/posthog-tracker/route.ts");
 assert.match(source,/fp_website_analytics_consent_v1/);
 assert.match(source,/Permitir analítica/);
 assert.match(source,/globalPrivacyControl/);
 assert.match(source,/doNotTrack/);
 assert.match(source,/disable_session_recording:true/);
 assert.match(source,/autocapture:false/);
 assert.match(source,/form_start/);
 assert.match(source,/fp_section_dwell/);
 assert.match(source,/fp_scroll_depth/);
 assert.doesNotMatch(source,/localStorage\.setItem\([^\n]*phone|fingerprint|geolocat|formData|innerHTML|service_role/i);
});
test("Private PostHog settings are not hardcoded in website-facing source",()=>{
 const source=read("app/api/family-power/posthog-tracker/route.ts");
 assert.match(source,/process\.env\.FP_POSTHOG_TOKEN/);
 assert.match(source,/process\.env\.FP_POSTHOG_HOST/);
 assert.doesNotMatch(source,/phc_[a-zA-Z0-9]{12,}/);
 assert.doesNotMatch(source,/posthog_personal_api_key|service_role/i);
});
