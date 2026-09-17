import { redirect } from "next/navigation";

/**
 * Legacy Proyecto 812 administrative entry point.
 *
 * Buyer/seller operations now belong to the canonical multi-tenant CRM.
 * Keep this route as a compatibility alias so existing bookmarks do not
 * strand users in the legacy parallel sales portal.
 */
export default function PropertySalesPage() {
  redirect("/crm");
}
