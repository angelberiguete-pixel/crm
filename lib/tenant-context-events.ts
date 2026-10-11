// This revision is only a notification. The tenant is always read from Supabase.
export const TENANT_CONTEXT_REVISION = "look_crm_tenant_context_revision";
export const TENANT_CONTEXT_EVENT = "look-crm-tenant-context-changed";
export function notifyTenantContextChanged() {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(TENANT_CONTEXT_REVISION, crypto.randomUUID()); } catch { /* Focus revalidation covers unavailable storage. */ }
  window.dispatchEvent(new Event(TENANT_CONTEXT_EVENT));
}
