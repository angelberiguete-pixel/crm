import {supabase} from "@/lib/supabase";

// Best-effort close must happen BEFORE removing auth credentials.
// A disconnected browser may not report logout; the server's two-minute
// last-seen threshold is authoritative for the "online" indicator.
export async function signOutOfTenant(tenantId:string|null) {
  if(tenantId) {
    try {
      await supabase.rpc("crm_member_session_close",{p_tenant_id:tenantId});
    } catch {
      // Logout must remain possible even if presence tracking is unavailable.
    }
  }
  return supabase.auth.signOut();
}
