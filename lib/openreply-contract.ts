export type OpenReplyCampaign = {
  id: string;
  name: string;
  isActive: boolean;
  keywords: string[];
};

export type OpenReplyStats = {
  campaignId: string;
  sent: number;
  failed: number;
  pending: number;
  skipped: number;
  rawClicks: number;
};

export type OpenReplySnapshot = {
  tenantId: string;
  state: "not_configured" | "connected_readonly";
  dashboardUrl: string | null;
  checkedAt: string;
  campaigns?: OpenReplyCampaign[];
  stats?: OpenReplyStats;
};
