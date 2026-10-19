/**
 * Contact vCard export adapted from Atomic CRM's contactModel.ts.
 * Copyright (c) 2024-present Francois Zaninotto, Marmelab.
 * Source: https://github.com/marmelab/atomic-crm/blob/94818e50154093612345cf6ab5a137f152025f77/src/components/atomic-crm/contacts/contactModel.ts
 * License: MIT (see third_party/atomic-crm/LICENSE.md).
 *
 * Unlike Atomic CRM, this CRM stores a single display_name and separate
 * WhatsApp/phone fields. No contact data is fetched by this module.
 */
export type ContactVCardInput = Readonly<{
  display_name: string;
  job_title?: string | null;
  company_name?: string | null;
  email?: string | null;
  phone?: string | null;
  whatsapp_phone?: string | null;
}>;

function escapeVCardValue(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

/** vCard lines are limited to 75 UTF-8 octets; folded continuations start with a space. */
function foldLine(line: string): string {
  const encoder = new TextEncoder();
  const result: string[] = [];
  let part = "";
  let octets = 0;
  for (const char of line) {
    const charOctets = encoder.encode(char).length;
    if (octets + charOctets > 75) {
      result.push(part);
      part = " ";
      octets = 1;
    }
    part += char;
    octets += charOctets;
  }
  result.push(part);
  return result.join("\r\n");
}

export function exportContactToVCard(contact: ContactVCardInput): string {
  const name = contact.display_name.trim();
  if (!name) throw new Error("No se puede exportar un contacto sin nombre.");

  // N has five components. The legacy CRM stores a full display name rather
  // than verified given/family names, so do not guess surname boundaries.
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    "N:;" + escapeVCardValue(name) + ";;;",
    "FN:" + escapeVCardValue(name),
  ];

  if (contact.job_title?.trim()) lines.push("TITLE:" + escapeVCardValue(contact.job_title.trim()));
  if (contact.company_name?.trim()) lines.push("ORG:" + escapeVCardValue(contact.company_name.trim()));
  if (contact.email?.trim()) lines.push("EMAIL;TYPE=INTERNET:" + escapeVCardValue(contact.email.trim()));

  const whatsapp = contact.whatsapp_phone?.trim();
  const phone = contact.phone?.trim();
  if (whatsapp) lines.push("TEL;TYPE=CELL:" + escapeVCardValue(whatsapp));
  if (phone && phone !== whatsapp) {
    lines.push("TEL;TYPE=" + (whatsapp ? "WORK" : "VOICE") + ":" + escapeVCardValue(phone));
  }
  lines.push("END:VCARD");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

export function contactVCardFilename(displayName: string): string {
  const slug = displayName.normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "contacto";
  return slug + ".vcf";
}
