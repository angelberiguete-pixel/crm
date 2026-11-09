"use client";
import {useActiveTenant} from "@/components/tenant-context";
import CrmUmamiAnalytics from "@/components/crm-umami-analytics";
import FamilyPowerBehaviorDashboard from "@/components/family-power-behavior-dashboard";

export default function CrmWebAnalytics(){
 const tenant=useActiveTenant();
 return tenant?.tenant_slug==="family-power"
  ? <FamilyPowerBehaviorDashboard/> : <CrmUmamiAnalytics/>;
}
