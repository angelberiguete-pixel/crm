import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  CITA24_TIMEZONE, normalizeContactPhone, parseClinicLocalDateTime, slotsOverlap,
} from "../lib/cita24-contract.ts";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("Dominican appointment date/time is parsed deterministically", () => {
  assert.equal(CITA24_TIMEZONE, "America/Santo_Domingo");
  assert.equal(parseClinicLocalDateTime("2026-11-09T10:15")?.toISOString(), "2026-11-09T14:15:00.000Z");
  assert.equal(parseClinicLocalDateTime("2026-02-31T10:00"), null);
  assert.equal(parseClinicLocalDateTime("wrong"), null);
  assert.equal(normalizeContactPhone("+1 (809) 555-0100"), "+18095550100");
});
test("Half-open slots disallow overlapping appointments, but allow back-to-back", () => {
  assert.equal(slotsOverlap(10, 20, 15, 25), true);
  assert.equal(slotsOverlap(10, 20, 20, 30), false);
  assert.equal(slotsOverlap(15, 25, 10, 20), true);
});
test("Clinical route uses the existing tenant access gate", () => {
  const route = read("app/crm/[[...slug]]/page.tsx");
  const permissions = read("components/tenant-permission-gate.tsx");
  const workspace = read("components/crm-workspace.tsx");
  assert.match(route, /Cita24ClinicWorkspace/);
  assert.match(route, /TenantPermissionGate/);
  assert.match(permissions, /cita24:\s*"calendar"/);
  assert.match(permissions, /section==="cita24".*family-power/);
  assert.match(workspace, /\["cita24",\s*"Cita-24"/);
});
test("Clinic admin uses tenant-scoped existing CRM tables and no outbound provider", () => {
  const source = read("components/cita24-clinic-workspace.tsx");
  for (const table of ["contacts", "calendar_events", "tasks"]) {
    assert.ok(source.includes('from("' + table + '")'), table + " should be reused");
  }
  assert.ok((source.match(/\.eq\("tenant_id",\s*tenantId\)/g) || []).length >= 6);
  assert.match(source, /contains\("metadata",\s*\{ module: "cita24" \}\)/);
  assert.match(source, /no se enviaron mensajes/);
  assert.doesNotMatch(source, /service_role|NEXT_PUBLIC_SUPABASE_SERVICE/);
  assert.doesNotMatch(source, /\bfetch\(/);
  assert.doesNotMatch(source, /AUREVECTOR|LOOK SOCIAL MEDIA/);
});
