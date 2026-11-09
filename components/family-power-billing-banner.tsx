"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertCircle } from "lucide-react";
import { useActiveTenant } from "@/components/tenant-context";
import { supabase } from "@/lib/supabase";

type Outstanding={amount_due_cents:number;status:string;metadata:Record<string,unknown>|null};

export default function FamilyPowerBillingBanner(){
  const tenant=useActiveTenant();
  const authorized=tenant?.tenant_slug==="family-power" && ["owner","admin"].includes(tenant.membership_role);
  const tenantId=tenant?.tenant_id;
  const [due,setDue]=useState<number|null>(null);
  useEffect(()=>{
    let alive=true;setDue(null);
    if(!authorized||!tenantId)return()=>{alive=false;};
    const refresh=async()=>{
      const {data,error}=await supabase.from("billing_invoices")
        .select("amount_due_cents,status,metadata").eq("tenant_id",tenantId).eq("status","open").limit(30);
      if(!alive)return;
      if(error){setDue(null);return;}
      const outstanding=(data??[] as Outstanding[]).reduce((sum,row)=>sum+Math.max(0,Number(row.amount_due_cents)||0),0);
      setDue(outstanding>0?outstanding:0);
    };
    void refresh();
    window.addEventListener("focus",refresh);
    return()=>{alive=false;window.removeEventListener("focus",refresh);};
  },[authorized,tenantId]);
  if(!authorized||due===null||due<=0)return null;
  return <div role="status" className="notice" style={{display:"flex",alignItems:"center",gap:10,justifyContent:"space-between",flexWrap:"wrap",margin:"12px auto",maxWidth:1230}}>
    <span style={{display:"inline-flex",alignItems:"center",gap:8}}>
      <AlertCircle size={18} aria-hidden="true"/>
      <strong>Pago pendiente de verificación:</strong>
      {new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(due/100)}
    </span>
    <Link href="/crm/pagos" className="button small">Ver factura y pagar</Link>
  </div>;
}
