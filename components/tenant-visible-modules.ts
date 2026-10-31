"use client";
import {useEffect,useState} from "react";
import {supabase} from "@/lib/supabase";
import {useActiveTenant} from "@/components/tenant-context";

const MODULES:Record<string,string>={
 "":"dashboard",companies:"companies",contacts:"contacts",
 revenue:"pipeline",sales:"pipeline",inbox:"inbox",marketing:"settings",
 sessions:"settings",products:"products",quotations:"quotations",
 operations:"operations",calendar:"calendar",automations:"automations",
 files:"dashboard",channels:"settings",integrations:"settings",settings:"settings"
};
/** Navigation is user friendly; TenantPermissionGate and SQL RLS remain
 * the actual security controls on both pages and data.
 */
export function useTenantVisibleModules(){
 const t=useActiveTenant(),[permissions,setPermissions]=useState<Record<string,unknown>|null>(null),
   [enabled,setEnabled]=useState<Record<string,boolean>>({});
 useEffect(()=>{
   let active=true;setPermissions(null);setEnabled({});
   if(!t?.tenant_id)return()=>{active=false;};
   void (async()=>{
     const [p,m]=await Promise.all([
       supabase.rpc("tenant_current_permissions",{p_tenant_id:t.tenant_id}),
       supabase.rpc("tenant_effective_modules",{p_tenant_id:t.tenant_id})
     ]);
     if(!active||p.error||m.error)return;
     setPermissions((p.data??{}) as Record<string,unknown>);
     const flags:Record<string,boolean>={};
     for(const row of (m.data??[]) as Array<{module_key:string;enabled:boolean}>)flags[row.module_key]=row.enabled;
     setEnabled(flags);
   })().catch(()=>{});
   return()=>{active=false;};
 },[t?.tenant_id]);
 function canSee(section:string){
   if(section==="sessions")return t?.membership_role==="owner"||t?.membership_role==="admin";
   const role=t?.membership_role;
   if(role==="owner"||role==="admin")return true;
   if(!permissions)return false;
   const key=MODULES[section]??section;
   return (permissions.all===true||permissions[key]===true)&&enabled[key]!==false;
 }
 return {canSee,ready:!!permissions};
}
