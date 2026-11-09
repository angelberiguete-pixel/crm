import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

const read=(path)=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const portal=read("components/cita24-patient-portal.tsx");
const route=read("app/cita24/[slug]/page.tsx");
const clinic=read("components/cita24-clinic-extensions.tsx");
const intake=read("supabase/functions/cita24-public-request/index.ts");
const reception=read("supabase/functions/cita24-reception-draft/index.ts");
const dispatch=read("supabase/functions/cita24-reminder-dispatch/index.ts");
const schema=read("supabase/migrations/20261109110350_cita24_patient_portal_private_requests_and_ai_quota.sql");
const reminders=read("supabase/migrations/20261109110824_cita24_privacy_and_verified_whatsapp_reminder_queue.sql");

test("Public portal receives REQUESTS only, explicitly not confirmed bookings",()=>{
 assert.match(route,/Cita24PatientPortal/);
 assert.match(portal,/Solicitud recibida/);
 assert.match(portal,/No tienes una cita reservada todavía/);
 assert.match(portal,/cloudflare.com\/turnstile/);
 assert.match(portal,/privacy_url/);
 assert.doesNotMatch(portal,/service_role|SERVICE_ROLE_KEY/);
});
test("Intake is clinic-specific, turnstile verified, rate limited and private",()=>{
 for(const keyword of [
   "TURNSTILE_SECRET_KEY","CITA24_RATE_SALT","verifyTurnstile",
   "cita24_claim_request_quota","clinic.tenant_id","whatsapp_opt_in",
   "privacy_accepted","unknown_clinic"
 ])assert.ok(intake.includes(keyword),keyword);
 assert.doesNotMatch(intake,/from\("calendar_events"\)\.insert/);
 assert.doesNotMatch(intake, /api\.openai\.com|api\.ycloud\.com/);
 assert.match(schema,/alter table public\.cita24_visit_requests enable row level security/);
 assert.match(schema,/revoke all on public\.cita24_visit_requests from anon/);
 assert.match(reminders,/cita24_privacy_required_for_public/);
});
test("AI only drafts administrative answers with auth, cost flag and review",()=>{
 for(const keyword of ["CITA24_AI_DRAFT_ENABLED","OPENAI_API_KEY",
  "cita24_claim_ai_daily_quota","member.role","clinicalPattern",
  "privateDataPattern","review_required:true","sent:false","store:false"])
  assert.ok(reception.includes(keyword),keyword);
 assert.doesNotMatch(reception,/YCLOUD_API_KEY|\/whatsapp\/messages/);
});
test("WhatsApp scheduled reminders remain opt-in, verified and fail closed",()=>{
 for(const keyword of [
  "CITA24_REMINDERS_ENABLED","CITA24_DISPATCH_SECRET","YCLOUD_API_KEY",
  "optin","optedOut","verified_at","APPROVED","UTILITY",
  "filterUnsubscribed:true","filterBlocked:true","externalId:job.id"
 ])assert.ok(dispatch.includes(keyword),keyword);
 assert.match(reminders,/private\.cita24_queue_reminder/);
 assert.match(reminders,/cita24_reminder_unique/);
 assert.match(reminders,/whatsapp_reminders_enabled/);
 assert.match(reminders,/not coalesce\(v_opt_in,false\)/);
 assert.doesNotMatch(dispatch,/CITA24_REMINDERS_ENABLED"\)\s*!==\s*"false"/);
});
test("Clinic UI can triage requests, configure privacy and query YCloud readiness",()=>{
 assert.match(clinic,/cita24_visit_requests/);
 assert.match(clinic,/Registrar en CRM y dar seguimiento/);
 assert.match(clinic,/tenant_ycloud_connection_status/);
 assert.match(clinic,/privac[y|y]_url|privacy_url/);
 assert.match(clinic,/cita24-reception-draft/);
 assert.match(clinic,/aiEnabled/);
});
