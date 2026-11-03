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
  return supabase.auth.signOut({scope:"local"});
}

/**
 * A platform owner leaving a customer's locked workspace returns to LOOK login.
 * Customer users return to their own branded login. This decision checks the
 * authoritative platform role BEFORE the shared Supabase session is closed.
 * Errors fail closed to the customer's login and never grant platform access.
 */
export async function tenantLogoutDestination(tenantSlug:string):Promise<"/login"|"/family-power/login"> {
  if(tenantSlug!=="family-power")return "/login";
  try{
    const access=await supabase.rpc("platform_current_access");
    if(!access.error&&
      (access.data as {is_platform_admin?:boolean}|null)?.is_platform_admin===true)
      return "/login";
  }catch{
    // An unavailable platform authority cannot grant elevated navigation.
  }
  return "/family-power/login";
}
