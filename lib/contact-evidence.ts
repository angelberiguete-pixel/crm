export const EVIDENCE_FIELDS = [
  ["name", "Nombre"],
  ["job_title", "Cargo"],
  ["company", "Empresa"],
  ["phone", "Teléfono"],
  ["email", "Correo"],
  ["address", "Dirección"],
  ["product_interest", "Interés comercial"],
  ["other", "Otro dato"],
] as const;

export const EVIDENCE_SOURCES = [
  ["manual", "Declaración/manual"],
  ["conversation", "Conversación"],
  ["document", "Documento"],
  ["website", "Sitio web"],
] as const;

export type ContactEvidenceDraft = {
  contactId: string;
  fieldKey: string;
  claim: string;
  sourceKind: string;
  reference: string;
  excerpt: string;
};

export function validateContactEvidenceDraft(value: ContactEvidenceDraft): string | null {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuid.test(value.contactId)) return "Selecciona un contacto válido.";
  if (!EVIDENCE_FIELDS.some(([key]) => key === value.fieldKey)) return "El campo no está autorizado.";
  if (!EVIDENCE_SOURCES.some(([key]) => key === value.sourceKind)) return "La fuente no está autorizada.";
  if (value.claim.trim().length < 3 || value.claim.trim().length > 1200) {
    return "El dato propuesto debe tener entre 3 y 1200 caracteres.";
  }
  if (value.reference.trim().length > 500 || value.excerpt.trim().length > 1000) {
    return "La referencia o el extracto supera el límite permitido.";
  }
  return null;
}

export function evidenceStatus(decision: "verified" | "rejected" | null): string {
  if (decision === "verified") return "Verificado por una persona";
  if (decision === "rejected") return "Rechazado";
  return "Sin verificar";
}
