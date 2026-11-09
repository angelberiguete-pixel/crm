/**
 * Verified, tenant-scoped Meta Hub readiness projection.
 * This is READ-ONLY. A route is not evidence of message delivery or Meta approval.
 * Do not use these display statuses to authorize provider actions.
 */
export type MetaHubChannel = {
  id: string;
  provider: string;
  record_status: string;
  verified: boolean;
};
export type MetaHubHealth = {
  tenant_id: string;
  whatsapp_verified_route: boolean;
  channels: MetaHubChannel[];
};
export type MetaHubOpenReply = {
  tenant_id: string;
  routes: Array<{
    id: string;
    channel_id: string;
    is_enabled: boolean;
    verified_at: string | null;
  }>;
  received_events: number;
  draft_quotes: number;
  last_received_at: string | null;
};
export type MetaHubState = "verified_route" | "pending" | "disconnected" | "unknown" | "not_implemented";
export type MetaHubSnapshot = {
  whatsapp: MetaHubState;
  instagram: MetaHubState;
  messenger: MetaHubState;
  leadAds: MetaHubState;
  receivedEvents: number | null;
  draftQuotes: number | null;
};

/** The server RPCs must authorize tenant access before this function is called. */
export function deriveMetaHubSnapshot(
  tenantId: string,
  health: MetaHubHealth | null,
  openreply: MetaHubOpenReply | null | undefined,
): MetaHubSnapshot {
  const empty: MetaHubSnapshot = {
    whatsapp: "unknown",
    instagram: "unknown",
    messenger: "not_implemented",
    leadAds: "not_implemented",
    receivedEvents: null,
    draftQuotes: null,
  };
  if (!tenantId || health?.tenant_id !== tenantId || !Array.isArray(health.channels)) return empty;
  const channels = health.channels;
  const whatsapps = channels.filter(c => c.provider === "whatsapp");
  const instagram = channels.filter(c => c.provider === "instagram");
  const whatsapp = Boolean(health.whatsapp_verified_route) && whatsapps.some(
    c => c.verified === true && c.record_status === "connected",
  ) ? "verified_route" : whatsapps.length ? "pending" : "disconnected";
  if (openreply === undefined || openreply === null || openreply.tenant_id !== tenantId) {
    return { ...empty, whatsapp, instagram: "unknown" };
  }
  // Both ownership and provider are checked: a route cannot verify another tenant/channel.
  const verifiedIg = openreply.routes.some(route =>
    route.is_enabled === true && Boolean(route.verified_at) &&
    instagram.some(c => c.id === route.channel_id && c.record_status === "connected"),
  );
  const count = (value: number): number | null =>
    Number.isSafeInteger(value) && value >= 0 ? value : null;
  return {
    whatsapp,
    instagram: verifiedIg ? "verified_route" : instagram.length ? "pending" : "disconnected",
    messenger: "not_implemented",
    leadAds: "not_implemented",
    receivedEvents: count(openreply.received_events),
    draftQuotes: count(openreply.draft_quotes),
  };
}
