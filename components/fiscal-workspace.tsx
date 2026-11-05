"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";


type InvoiceRow = { id:string; document_type:string; buyer_name:string|null; status:string; total:number; created_at:string };
const money=(v:number)=>new Intl.NumberFormat("es-DO",{style:"currency",currency:"DOP"}).format(v);
export default function FiscalWorkspace({tenantId}:{tenantId:string}){
 const [invoices,setInvoices]=useState<InvoiceRow[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const [buyer,setBuyer]=useState("");

 const [description,setDescription]=useState("");
 const [price,setPrice]=useState("");
 const [busy,setBusy]=useState(false);
 const load=useCallback(async()=>{
  setLoading(true);
  const {data,error}=await supabase.from("fiscal_invoices").select("id,document_type,buyer_name,status,total,created_at").eq("tenant_id",tenantId).order("created_at",{ascending:false}).limit(50);
  setLoading(false);
  if(error){setError("El módulo fiscal todavía no está configurado para esta empresa. "+error.message);return;}
  setInvoices((data??[]) as InvoiceRow[]);setError("");
 },[tenantId]);
 useEffect(()=>{void load()},[load]);
 async function createDraft(event:React.FormEvent){
  event.preventDefault();
  if(busy)return;
  setBusy(true);setError("");
  try{
   const unitPrice=Number(price);
   if(!description.trim()||!Number.isFinite(unitPrice)||unitPrice<=0)throw new Error("Completa un concepto y un precio válido.");
   const result=await supabase.rpc("fiscal_create_demo_draft",{p_tenant_id:tenantId,p_buyer_name:buyer.trim(),p_description:description.trim(),p_unit_price:unitPrice});
   if(result.error)throw result.error;
   setDescription("");setPrice("");setBuyer("");
   await load();
  }catch(err){setError(err instanceof Error?err.message:"No se pudo crear el borrador.");}
  finally{setBusy(false);}
 }
 return <section className="stack gap-16">
  <div className="notice"><strong>Entorno de preparación fiscal.</strong> Solo borradores. No emite e-NCF ni transmite a la DGII. Los cálculos son preliminares.</div>
  <div className="card">
   <h2>Nuevo borrador</h2>
   <form onSubmit={createDraft} className="stack gap-12">
    <label>Tipo de comprobante
     <select value="E32" disabled><option value="E32">E32 · Consumo (borrador)</option></select>
    </label>
    <label>Nombre del comprador (opcional en esta vista preliminar)<input value={buyer} onChange={e=>setBuyer(e.target.value)} maxLength={160}/></label>
    <label>Concepto<input value={description} onChange={e=>setDescription(e.target.value)} required maxLength={250}/></label>
    <label>Precio base RD$<input type="number" min="0.01" step="0.01" value={price} onChange={e=>setPrice(e.target.value)} required/></label>
    <button className="button primary" type="submit" disabled={busy}>{busy?"Guardando…":"Guardar borrador (sin emisión)"}</button>
   </form>
  </div>
  {error&&<div role="alert" className="notice">{error}</div>}
  <div className="card"><h2>Borradores y registros fiscales</h2>
   {loading?<p>Cargando…</p>:invoices.length===0?<p>No hay borradores registrados.</p>:
    <div style={{overflowX:"auto"}}><table style={{width:"100%"}}><thead><tr><th>Tipo</th><th>Comprador</th><th>Estado</th><th>Total preliminar</th></tr></thead><tbody>
     {invoices.map(i=><tr key={i.id}><td>{i.document_type}</td><td>{i.buyer_name||"Consumidor"}</td><td>{i.status}</td><td>{money(Number(i.total))}</td></tr>)}
    </tbody></table></div>}
  </div>
 </section>;
}
