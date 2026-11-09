"use client";

import Link from "next/link";
import {useEffect,useState} from "react";
import {AlertCircle} from "lucide-react";
import {useActiveTenant} from "@/components/tenant-context";
import {supabase} from "@/lib/supabase";

type Implementation={
  status:string;remaining_dop_cents?:number;paid_invoices_awaiting_allocation?:number;
  first_installment?:{status:string;amount_due_cents:number}|null
};
const dop=(cents:number)=>new Intl.NumberFormat("es-DO",{style:"currency",currency:"DOP"}).format(cents/100);

export default function FamilyPowerBillingBanner(){
  const tenant=useActiveTenant();
  const authorized=tenant?.tenant_slug==="family-power"&&["owner","admin"].includes(tenant.membership_role);
  const tenantId=tenant?.tenant_id;
  const [contract,setContract]=useState<Implementation|null>(null);
  useEffect(()=>{
    let live=true;setContract(null);
    if(!authorized||!tenantId)return()=>{live=false;};
    const load=async()=>{
      const {data,error}=await supabase.rpc("crm_implementation_contract_summary",{p_tenant_id:tenantId});
      if(!live)return;
      setContract(!error&&data&&typeof data==="object" ? data as Implementation :null);
    };
    void load();window.addEventListener("focus",load);
    return()=>{live=false;window.removeEventListener("focus",load);};
  },[authorized,tenantId]);
  const due=contract?.remaining_dop_cents??0;
  if(!authorized||contract?.status!=="open"||due<=0)return null;
  return <div role="status" className="notice" style={{display:"flex",alignItems:"center",gap:10,justifyContent:"space-between",flexWrap:"wrap",margin:"12px auto",maxWidth:1230}}>
    <span style={{display:"inline-flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
      <AlertCircle size={18} aria-hidden="true"/>
      <strong>Implementación pendiente: {dop(due)}</strong>
      {contract.first_installment?.status==="open"&&<span>· Cuota 1 PayPal: US$197</span>}
      {(contract.paid_invoices_awaiting_allocation??0)>0&&<span>· Abono pagado por aplicar a pesos</span>}
    </span>
    <Link href="/crm/pagos" className="button small">Ver cuotas y abonar</Link>
  </div>;
}
