export type RealEstateStage = "draft" | "published" | "lead" | "visit_scheduled" | "negotiating" | "closed" | "lost";
export type RealEstateRole = "owner" | "admin" | "agent" | "viewer";
export type RealEstateEvent = "publish" | "capture_lead" | "schedule_visit" | "start_negotiation" | "close" | "mark_lost";
export interface RealEstateContext {
  tenantId: string;
  actorTenantId: string;
  role: RealEstateRole;
  propertyIsApproved: boolean;
  hasPublishedListing: boolean;
  hasLead: boolean;
  hasVisit: boolean;
  hasAcceptedOffer: boolean;
}
const transitions: Record<RealEstateStage, Partial<Record<RealEstateEvent, RealEstateStage>>> = {
  draft: { publish: "published" },
  published: { capture_lead: "lead", mark_lost: "lost" },
  lead: { schedule_visit: "visit_scheduled", start_negotiation: "negotiating", mark_lost: "lost" },
  visit_scheduled: { start_negotiation: "negotiating", mark_lost: "lost" },
  negotiating: { close: "closed", mark_lost: "lost" },
  closed: {},
  lost: {},
};
/** Domain validation only: server endpoints must also authenticate and enforce Postgres RLS. */
export function transitionRealEstateStage(stage: RealEstateStage, event: RealEstateEvent, ctx: RealEstateContext): RealEstateStage {
  if (!ctx.tenantId || ctx.tenantId !== ctx.actorTenantId) throw new Error("TENANT_MISMATCH");
  if (!["owner", "admin", "agent"].includes(ctx.role)) throw new Error("FORBIDDEN");
  const next = transitions[stage]?.[event];
  if (!next) throw new Error("INVALID_TRANSITION");
  if (event === "publish" && !ctx.propertyIsApproved) throw new Error("PROPERTY_NOT_APPROVED");
  if (event === "capture_lead" && !ctx.hasPublishedListing) throw new Error("LISTING_NOT_PUBLISHED");
  if (event === "schedule_visit" && !ctx.hasLead) throw new Error("LEAD_REQUIRED");
  if (event === "start_negotiation" && !ctx.hasLead) throw new Error("LEAD_REQUIRED");
  if (event === "close" && !ctx.hasAcceptedOffer) throw new Error("ACCEPTED_OFFER_REQUIRED");
  return next;
}
