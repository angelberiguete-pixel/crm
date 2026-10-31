"use client";
import {useActiveTenant} from "@/components/tenant-context";

/** A client workspace is not an agency-account switcher.
 * Platform owners choose a business from /mis-empresas before entering
 * a support session, and must sign out before returning to their CRM.
 */
export default function TenantSwitcher(){
 const tenant=useActiveTenant();
 if(!tenant)return null;
 return <div className="tenant-switcher tenant-company-current" aria-label="Empresa de esta sesión">
   <span className="tenant-company-label">{tenant.tenant_name}</span>
 </div>;
}
