/**
 * UI-only navigation hint. The backend always decides whether someone is an
 * actual platform owner; this flag only chooses the login page AFTER sign-out.
 */
const PLATFORM_RETURN_KEY = "crm:platform-return-after-client-logout";

export function markPlatformClientEntry() {
  try { window.sessionStorage.setItem(PLATFORM_RETURN_KEY, "1"); }
  catch { /* Browser storage may be unavailable. */ }
}

export function tenantLogoutDestination(slug: string): string {
  let returningFromPlatform = false;
  try {
    returningFromPlatform = window.sessionStorage.getItem(PLATFORM_RETURN_KEY) === "1";
    window.sessionStorage.removeItem(PLATFORM_RETURN_KEY);
    if (returningFromPlatform) window.sessionStorage.removeItem("crm:login-intent");
  } catch { /* Login selection is not authorization. */ }
  // Direct Family Power users keep their branded login. Platform operators
  // who entered a client from Mis empresas return to the shared owner login.
  return returningFromPlatform ? "/login" :
    slug === "family-power" ? "/family-power/login" : "/login";
}
