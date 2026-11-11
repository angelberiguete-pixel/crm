import { createClient } from "@supabase/supabase-js";
import { handleOpenReplyRequest, hasOpenReplyAdminMembership } from "@/lib/openreply.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleOpenReplyRequest(request, {
    connections: process.env.CRM_OPENREPLY_CONNECTIONS_JSON,
    async verifyAccess(token, tenantId) {
      // Canonical publishable CRM credentials. Every query runs as the user;
      // no service-role access, cookie trust or browser-supplied membership.
      const client = createClient("https://ygipjqgyreeahslzorik.supabase.co", "sb_publishable_2Q7aF-M61t2OZWRrt-vebQ_t_oNK_u7", {
        global: {
          headers: { Authorization: "Bearer " + token },
          fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.any([request.signal, AbortSignal.timeout(5000)]) }),
        },
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
      const { data, error } = await client.auth.getUser(token);
      if (error || !data.user) return "unauthenticated";
      const membership = await client.rpc("list_my_tenants");
      if (membership.error) return "unavailable";
      const allowed = hasOpenReplyAdminMembership(membership.data, tenantId);
      if (!allowed) return "denied";
      // Existing backend authority checks tenant lifecycle/suspension and role.
      const health = await client.rpc("tenant_integration_health", { p_tenant_id: tenantId });
      if (health.error) return health.error.code === "42501" ? "denied" : "unavailable";
      if (health.data?.tenant_id !== tenantId) return "denied";
      return "allowed";
    },
  });
}
