import { redirect } from "next/navigation";

/**
 * Legacy Proyecto 812 login compatibility route.
 * Authentication and authorization are owned by the canonical CRM now;
 * never maintain a separate hard-coded administrator gate here.
 */
export default function PropertySalesLoginPage() {
  redirect("/crm");
}
