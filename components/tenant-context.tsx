"use client";

import { createContext, useContext, type ReactNode } from "react";

export type ActiveTenant = {
  tenant_id: string;
  tenant_name: string;
  tenant_slug: string;
  membership_role: string;
  is_active: boolean;
};
const TenantContext = createContext<ActiveTenant | null>(null);

export function TenantContextProvider({ tenant, children }: { tenant: ActiveTenant | null; children: ReactNode }) {
  return <TenantContext.Provider value={tenant}>{children}</TenantContext.Provider>;
}
export function useActiveTenant() {
  return useContext(TenantContext);
}
