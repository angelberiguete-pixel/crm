"use client";

import {useEffect} from "react";
import {supabase} from "@/lib/supabase";

// Presence is recorded only for a verified company workspace. The server
// derives the user and auth session from JWT, never from browser-provided IDs.
// A 60-second cadence is compatible with the database's 75-second activity cap.
const HEARTBEAT_MS = 60_000;

export default function TenantSessionPresence({tenantId}:{tenantId:string}) {
  useEffect(()=>{
    let disposed=false;
    let sending=false;
    const heartbeat=async()=>{
      if(disposed || document.visibilityState!=="visible" || sending) return;
      sending=true;
      try {
        const {data:{session}}=await supabase.auth.getSession();
        if(disposed || !session) return;
        // The RPC verifies the active tenant, membership and real auth session.
        // Presence telemetry must never stop the employee from using the CRM.
        await supabase.rpc("crm_member_session_heartbeat",{p_tenant_id:tenantId});
      } catch {
        // A failed heartbeat is not evidence that a user was connected.
      } finally {
        sending=false;
      }
    };
    const onVisibility=()=>{if(document.visibilityState==="visible")void heartbeat();};
    void heartbeat();
    const timer=window.setInterval(()=>void heartbeat(),HEARTBEAT_MS);
    document.addEventListener("visibilitychange",onVisibility);
    return()=>{
      disposed=true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange",onVisibility);
    };
  },[tenantId]);
  return null;
}
