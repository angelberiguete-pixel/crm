import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  EVIDENCE_FIELDS, EVIDENCE_SOURCES, evidenceStatus,
  validateContactEvidenceDraft,
} from "../lib/contact-evidence.ts";

const id = "11111111-1111-4111-8111-111111111111";
const draft = {
  contactId: id, fieldKey: "job_title", claim: "Responsable técnico",
  sourceKind: "document", reference: "Ficha recibida y comprobada", excerpt: "",
};

test("no AI self-scoring: all submitted claims are unverified until human decision", () => {
  assert.equal(evidenceStatus(null), "Sin verificar");
  assert.equal(evidenceStatus("verified"), "Verificado por una persona");
  assert.equal(evidenceStatus("rejected"), "Rechazado");
  assert.ok(EVIDENCE_FIELDS.length >= 5);
  assert.ok(!EVIDENCE_SOURCES.some(([kind]) => kind === "ai_run"));
});

test("validate contact, source, field, claim and bounded attribution before insert", () => {
  assert.equal(validateContactEvidenceDraft(draft), null);
  assert.match(validateContactEvidenceDraft({ ...draft, contactId: id.replace("8", "x") }) ?? "", /contacto/);
  assert.match(validateContactEvidenceDraft({ ...draft, sourceKind: "ai_run" }) ?? "", /fuente/);
  assert.match(validateContactEvidenceDraft({ ...draft, fieldKey: "internal_secret" }) ?? "", /campo/);
  assert.match(validateContactEvidenceDraft({ ...draft, claim: "x" }) ?? "", /dato propuesto/);
  assert.match(validateContactEvidenceDraft({ ...draft, claim: "x".repeat(1201) }) ?? "", /dato propuesto/);
  assert.match(validateContactEvidenceDraft({ ...draft, reference: "x".repeat(501) }) ?? "", /límite/);
  assert.match(validateContactEvidenceDraft({ ...draft, excerpt: "x".repeat(1001) }) ?? "", /límite/);
});

test("migration is append-only and enforces composite tenant references plus review authority", () => {
  const sql = readFileSync(
    new URL("../supabase/migrations/20261103190000_crm_contact_evidence_review.sql", import.meta.url), "utf8",
  );
  for (const name of ["crm_contact_evidence", "crm_contact_evidence_reviews"]) {
    assert.match(sql, new RegExp("create table public\\." + name + " \\(", "i"));
    assert.match(sql, new RegExp("alter table public\\." + name + " enable row level security;", "i"));
    assert.match(sql, new RegExp("revoke all on public\\." + name + " from public,anon,authenticated;", "i"));
    assert.match(sql, new RegExp("grant select,insert on public\\." + name + " to authenticated;", "i"));
    assert.doesNotMatch(sql, new RegExp("grant .*update.* on public\\." + name + " to authenticated", "i"));
  }
  assert.match(sql, /foreign key \(tenant_id,contact_id\)[\s\S]*references public\.contacts\(tenant_id,id\)/i);
  assert.match(sql, /foreign key \(tenant_id,ai_run_id\)[\s\S]*references public\.ai_agent_runs\(tenant_id,id\)/i);
  assert.match(sql, /foreign key \(tenant_id,evidence_id\)[\s\S]*references public\.crm_contact_evidence\(tenant_id,id\)/i);
  assert.match(sql, /unique\(tenant_id,evidence_id\)/i);
  assert.match(sql, /private\.is_tenant_admin\(tenant_id\)/i);
  assert.match(sql, /private\.crm_active_tenant_matches\(tenant_id\)/i);
  assert.match(sql, /reviewer_id=\(select auth\.uid\(\)\)/i);
  assert.match(sql, /created_by=\(select auth\.uid\(\)\)/i);
  assert.doesNotMatch(sql, /update public\.contacts|insert into public\.messages|send_whatsapp/i);
});

test("route and UI require CRM tenant permission and never execute external actions", () => {
  const route = readFileSync(new URL("../app/crm/[[...slug]]/page.tsx", import.meta.url), "utf8");
  const gate = readFileSync(new URL("../components/tenant-permission-gate.tsx", import.meta.url), "utf8");
  const ui = readFileSync(new URL("../components/crm-contact-evidence.tsx", import.meta.url), "utf8");
  assert.match(route, /section === "evidence"[\s\S]*<CrmContactEvidence\s*\/>/);
  assert.match(gate, /evidence: "settings"/);
  assert.match(ui, /useActiveTenant\(\)/);
  assert.match(ui, /\.eq\("tenant_id", tenantId\)/);
  assert.match(ui, /crm_contact_evidence_reviews/);
  assert.match(ui, /No se modificó la ficha del cliente/);
  assert.doesNotMatch(ui, /\.update\(|\.delete\(|fetch\(|supabase\.functions\.invoke\(/);
});
