"use client";

import {useActiveTenant} from "@/components/tenant-context";

/** The tenant is pinned to the current authenticated login.
 * Global company selection belongs only to /mis-empresas in the owner console.
 * No dropdown in a customer portal.
 */
export default function TenantSwitcher(){
 const tenant=useActiveTenant();
 if(!tenant)return null;
 return <div className="tenant-switcher tenant-current-label" aria-label={"Empresa activa: "+tenant.tenant_name}>
   <span>{tenant.tenant_name}</span>
 </div>;
}
