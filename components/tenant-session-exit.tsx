"use client";
import {useState} from "react";
import {useRouter} from "next/navigation";
import {LogOut} from "lucide-react";
import {supabase} from "@/lib/supabase";
import {useActiveTenant} from "@/components/tenant-context";
export default function TenantSessionExit(){
 const tenant=useActiveTenant(),router=useRouter();
 const [busy,setBusy]=useState(false),[error,setError]=useState("");
 if(!tenant||tenant.tenant_slug==="eurevector")return null;
 async function exit(){
  if(!tenant||busy)return;
  setBusy(true);setError("");
  try{await supabase.rpc("crm_member_session_close",{p_tenant_id:tenant.tenant_id});}catch{}
  const r=await supabase.auth.signOut();
  if(r.error){setError("No fue posible cerrar sesión.");setBusy(false);return;}
  router.replace("/login");
 }
 return <span className="tenant-session-exit">
   <button type="button" onClick={()=>void exit()} disabled={busy} title="Cerrar sesión y salir del CRM del cliente">
    <LogOut size={16}/><span>{busy?"Saliendo…":"Cerrar sesión"}</span>
   </button>{error&&<small role="alert">{error}</small>}
 </span>;
}
