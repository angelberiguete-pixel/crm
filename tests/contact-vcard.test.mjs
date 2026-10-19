import assert from "node:assert/strict";
import { test } from "node:test";
import { contactVCardFilename, exportContactToVCard } from "../lib/contact-vcard.ts";

test("exports a verified tenant-visible contact as a vCard with company and phone", () => {
  const vcard = exportContactToVCard({
    display_name: "Ángel Berigüete",
    job_title: "Director comercial",
    company_name: "Lazala, SRL",
    email: "angel@example.com",
    whatsapp_phone: "+1 809 555 0111",
    phone: "+1 809 555 0222",
  });
  assert.ok(vcard.startsWith("BEGIN:VCARD\r\nVERSION:3.0\r\n"));
  assert.ok(vcard.endsWith("END:VCARD\r\n"));
  assert.match(vcard, /FN:Ángel Berigüete\r\n/);
  assert.match(vcard, /N:;Ángel Berigüete;;;\r\n/);
  assert.match(vcard, /ORG:Lazala\\, SRL\r\n/);
  assert.match(vcard, /EMAIL;TYPE=INTERNET:angel@example\.com\r\n/);
  assert.match(vcard, /TEL;TYPE=CELL:\+1 809 555 0111\r\n/);
  assert.match(vcard, /TEL;TYPE=WORK:\+1 809 555 0222\r\n/);
});

test("deduplicates an identical WhatsApp and telephone number", () => {
  const vcard = exportContactToVCard({
    display_name: "Cliente",
    whatsapp_phone: "8095550100",
    phone: "8095550100",
  });
  assert.equal(vcard.match(/^TEL;/gm)?.length, 1);
});

test("escapes injected newlines and delimiters instead of creating new properties", () => {
  const vcard = exportContactToVCard({
    display_name: "Ana\nTEL:9999,;\\",
    email: "ana@example.com",
  });
  assert.ok(vcard.includes("FN:Ana\\nTEL:9999\\,\\;\\\\"));
  assert.equal(vcard.match(/^BEGIN:VCARD$/gm)?.length, 1);
  assert.equal(vcard.match(/^TEL:/gm)?.length ?? 0, 0);
});

test("folds long Unicode vCard lines by UTF-8 octets", () => {
  const name = "María José Peña".repeat(24);
  const vcard = exportContactToVCard({ display_name: name });
  for (const line of vcard.trimEnd().split("\r\n")) {
    assert.ok(Buffer.byteLength(line, "utf8") <= 75, "overlong vCard line: " + line);
  }
  assert.ok(vcard.includes("\r\n "));
});

test("rejects empty names and safely generates filenames", () => {
  assert.throws(() => exportContactToVCard({ display_name: "   " }), /sin nombre/);
  assert.equal(contactVCardFilename("Ángel Berigüete"), "Angel-Beriguete.vcf");
  assert.equal(contactVCardFilename("../../"), "contacto.vcf");
});
