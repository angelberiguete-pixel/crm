"use client";

import {useState} from "react";
import {useRouter} from "next/navigation";
import {LogOut} from "lucide-react";
import {useActiveTenant} from "@/components/tenant-context";
import {signOutOfTenant} from "@/lib/tenant-session";

// A client must be able to exit a locked company view without discovering
// or exposing the platform-admin UI. Mobile users can also sign out via Modules.
export default function TenantSessionExit() {
  const tenant=useActiveTenant();
  const router=useRouter();
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  if(!tenant||tenant.tenant_slug==="eurevector")return null;
  const logout=async()=>{
    if(busy)return;
    setBusy(true);setError("");
    try{
      const result=await signOutOfTenant(tenant.tenant_id);
      if(result.error){setError("No se pudo cerrar la sesión. Intenta nuevamente.");return;}
      router.replace(tenant.tenant_slug==="family-power"?"/family-power/login":"/login");
    }catch{
      setError("No se pudo cerrar la sesión. Intenta nuevamente.");
    }finally{
      setBusy(false);
    }
  };
  return <div className="tenant-session-exit">
    <button type="button" disabled={busy} aria-label="Cerrar sesión del cliente" onClick={()=>void logout()}>
      <LogOut size={15}/><span>{busy?"Saliendo…":"Salir de la empresa"}</span>
    </button>
    {error&&<small role="alert">{error}</small>}
  </div>;
}
