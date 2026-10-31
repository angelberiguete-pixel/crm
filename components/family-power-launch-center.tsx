"use client";

import Link from "next/link";
import {useCallback,useEffect,useMemo,useState} from "react";
import {CheckCircle2,FileText,RefreshCw,ShieldAlert} from "lucide-react";
import {useActiveTenant} from "@/components/tenant-context";
import {supabase} from "@/lib/supabase";

type Product={id:string;sku:string;name:string;status:string;sale_price:number;currency:string;stock_snapshot:number|null};
type FileRecord={id:string;filename:string;mime_type:string;status:string};
type Quote={id:string;quote_number:string;status:string;total:number;currency:string};
type Order={id:string;order_number:string;quotation_id:string|null;total:number;currency:string;amount_paid:number};
type ProductApproval={product_id:string;approved_price:number;currency:string};
type Receipt={id:string;order_id:string;amount:number;status:string;currency:string;evidence_file_id:string};
type Purchase={order_id:string;amount:number;delivery_state:string};
const number=(n:number)=>new Intl.NumberFormat("es-DO").format(Number(n||0));
const money=(n:number,c:string)=>{try{return new Intl.NumberFormat("es-DO",{style:"currency",currency:c}).format(Number(n||0));}catch{return c+" "+number(n);}};
const imageTypes=["image/jpeg","image/png","image/webp"];
const card={padding:"16px",border:"1px solid var(--border)",borderRadius:"12px",background:"var(--panel2)"} as const;
const formGrid={display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))",gap:12} as const;

export default function FamilyPowerLaunchCenter(){
 const tenant=useActiveTenant();
 const tenantId=tenant?.tenant_id??null;
 const allowed=tenant?.tenant_slug==="family-power"&&["owner","admin"].includes(tenant?.membership_role??"");
 const [revision,setRevision]=useState(0);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
 const [error,setError]=useState(""),[notice,setNotice]=useState("");
 const [backendReady,setBackendReady]=useState(false);
 const [products,setProducts]=useState<Product[]>([]),[files,setFiles]=useState<FileRecord[]>([]);
 const [quotes,setQuotes]=useState<Quote[]>([]),[orders,setOrders]=useState<Order[]>([]);
 const [approvals,setApprovals]=useState<ProductApproval[]>([]);
 const [receipts,setReceipts]=useState<Receipt[]>([]),[purchases,setPurchases]=useState<Purchase[]>([]);
 const [productId,setProductId]=useState(""),[photoId,setPhotoId]=useState(""),[technicalId,setTechnicalId]=useState("");
 const [orderId,setOrderId]=useState(""),[proofId,setProofId]=useState(""),[amount,setAmount]=useState("");
 const [bankReferences,setBankReferences]=useState<Record<string,string>>({});
 const [reconciled,setReconciled]=useState<Record<string,boolean>>({});
 const reload=useCallback(()=>setRevision(x=>x+1),[]);

 useEffect(()=>{
  let alive=true;
  setProducts([]);setFiles([]);setQuotes([]);setOrders([]);setApprovals([]);setReceipts([]);setPurchases([]);
  setError("");setNotice("");
  if(!allowed||!tenantId){setLoading(false);return()=>{alive=false;};}
  setLoading(true);
  void (async()=>{
   try{
    const [p,f,q,o,a,r,s]=await Promise.all([
      supabase.from("products").select("id,sku,name,status,sale_price,currency,stock_snapshot").eq("tenant_id",tenantId).limit(500),
      supabase.from("tenant_files").select("id,filename,mime_type,status").eq("tenant_id",tenantId).eq("status","ready").limit(500),
      supabase.from("quotations").select("id,quote_number,status,total,currency").eq("tenant_id",tenantId).limit(500),
      supabase.from("orders").select("id,order_number,quotation_id,total,currency,amount_paid").eq("tenant_id",tenantId).limit(500),
      supabase.from("crm_family_product_approvals").select("product_id,approved_price,currency").eq("tenant_id",tenantId).limit(500),
      supabase.from("crm_family_payment_receipts").select("id,order_id,amount,status,currency,evidence_file_id").eq("tenant_id",tenantId).limit(500),
      supabase.from("crm_family_purchase_outbox").select("order_id,amount,delivery_state").eq("tenant_id",tenantId).limit(500)
    ]);
    if(!alive)return;
    if(p.error||f.error||q.error||o.error){setError("No se pudo consultar todo el inventario comercial autorizado.");return;}
    setProducts((p.data??[]) as Product[]);
    setFiles((f.data??[]) as FileRecord[]);
    setQuotes((q.data??[]) as Quote[]);
    setOrders((o.data??[]) as Order[]);
    const moduleReady=!a.error&&!r.error&&!s.error;
    setBackendReady(moduleReady);
    if(moduleReady){
      setApprovals((a.data??[]) as ProductApproval[]);
      setReceipts((r.data??[]) as Receipt[]);
      setPurchases((s.data??[]) as Purchase[]);
    }
   }catch{if(alive)setError("La consulta al CRM no pudo completarse.");}
   finally{if(alive)setLoading(false);}
  })();
  return()=>{alive=false;};
 },[allowed,tenantId,revision]);

 const verified=useMemo(()=>{
  const map=new Map(approvals.map(a=>[a.product_id,a]));
  return products.filter(p=>p.status==="active"&&p.sale_price>0&&Number(p.stock_snapshot)>0
    &&map.has(p.id)&&Number(map.get(p.id)?.approved_price)===Number(p.sale_price)
    &&map.get(p.id)?.currency===p.currency);
 },[approvals,products]);
 const photoFiles=files.filter(f=>imageTypes.includes(f.mime_type));
 const techFiles=files.filter(f=>f.mime_type==="application/pdf");
 const accepted=new Set(quotes.filter(q=>q.status==="accepted").map(q=>q.id));
 const readyOrders=orders.filter(o=>o.quotation_id&&accepted.has(o.quotation_id)&&Number(o.total)>0);
 const selectedProduct=products.find(p=>p.id===productId);
 const selectedOrder=readyOrders.find(o=>o.id===orderId);
 const unsupported=!backendReady;
 const execute=async(name:string,args:Record<string,unknown>)=>{
  if(!allowed||!tenantId||busy||unsupported)return;
  setBusy(true);setNotice("");setError("");
  try{
   const {error:rpcError}=await supabase.rpc(name,args);
   if(rpcError){setError("Operación rechazada. Verifica permisos, archivos y datos comerciales antes de repetirla.");return;}
   setNotice("Operación registrada. Actualizando los registros de Family Power.");
   reload();
  }catch{setError("No se confirmó la operación. Comprueba su estado antes de repetirla.");}
  finally{setBusy(false);}
 };
 if(!allowed)return <main className="content"><h1>Acceso restringido</h1><p>Esta preparación corresponde únicamente a propietarios o administradores de Family Power.</p></main>;
 return <main className="content" style={{maxWidth:1250,margin:"0 auto",display:"grid",gap:18}}>
  <header className="topbar">
   <div><div className="eyebrow">FAMILY POWER · CONTROL DE LANZAMIENTO</div><h1>Preparación de ventas por WhatsApp</h1>
    <p className="muted">Inventario y cobros reales: nunca se genera una venta por una captura de pantalla sin conciliación bancaria.</p></div>
   <div className="top-actions"><button className="button" onClick={reload} type="button" disabled={loading||busy}><RefreshCw size={15}/> Actualizar</button></div>
  </header>
  {error&&<div className="notice" role="alert">{error}</div>}
  {notice&&<div className="notice" role="status">{notice}</div>}
  {loading?<div className="loading" role="status">Comprobando inventario y permisos…</div>:<>
   {!backendReady&&<div className="notice" role="alert"><ShieldAlert size={17}/> El circuito de verificación de productos y cobros aún no está habilitado en esta base de datos. Se requiere revisar y aplicar la migración de seguridad antes de usar sus botones.</div>}
   <div style={{...formGrid,gridTemplateColumns:"repeat(auto-fit,minmax(165px,1fr))"}}>
    {([["Productos registrados",products.length],["Productos aprobados",verified.length],["Cotizaciones reales",quotes.length],["Cotizaciones aceptadas",accepted.size],["Órdenes existentes",orders.length],["Comprobantes pendientes",receipts.filter(x=>x.status==="pending").length],["Ventas verificadas",purchases.length]] as [string,number][]).map(([label,value])=>
      <div style={card} key={label}><div className="muted">{label}</div><strong style={{fontSize:27}}>{number(value)}</strong></div>)}
   </div>
   <section style={card}>
    <h2>1. Catálogo antes de que la IA venda</h2>
    <p>La mención de 70 inversores no equivale a 70 SKU. Carga los modelos y sus cantidades reales. Cada modelo necesita precio, stock, fotografía auténtica y ficha técnica oficial aprobados por la administración.</p>
    <p><Link href="/crm/products" className="button">Cargar productos y precios</Link>{" "}<Link href="/crm/files" className="button"><FileText size={15}/> Subir fotos y PDF privados</Link></p>
    <div style={formGrid}>
     <label>Modelo o SKU registrado<select value={productId} onChange={e=>setProductId(e.target.value)}>
      <option value="">Selecciona un producto</option>{products.map(p=><option key={p.id} value={p.id}>{p.sku} · {p.name} · {money(p.sale_price,p.currency)}</option>)}</select></label>
     <label>Foto auténtica del producto<select value={photoId} onChange={e=>setPhotoId(e.target.value)}>
      <option value="">Selecciona foto subida</option>{photoFiles.map(f=><option key={f.id} value={f.id}>{f.filename}</option>)}</select></label>
     <label>Ficha técnica oficial (PDF)<select value={technicalId} onChange={e=>setTechnicalId(e.target.value)}>
      <option value="">Selecciona PDF subido</option>{techFiles.map(f=><option key={f.id} value={f.id}>{f.filename}</option>)}</select></label>
    </div>
    <p className="muted">La aprobación es una declaración humana de que modelo, precio, unidades y documentos corresponden al producto correcto.</p>
    <button className="button primary" type="button"
     disabled={busy||unsupported||!selectedProduct||Number(selectedProduct.sale_price)<=0||Number(selectedProduct.stock_snapshot)<=0||!photoId||!technicalId}
     onClick={()=>void execute("crm_family_approve_product",{p_tenant_id:tenantId,p_product_id:productId,p_photo_file_id:photoId,p_technical_file_id:technicalId})}>
      <CheckCircle2 size={15}/> Aprobar ficha y precio verificables
    </button>
   </section>
   <section style={card}>
    <h2>2. Cotización y aceptación</h2>
    <p>Primero se envían producto, fotografía y PDF técnico; después, una cotización con importe y condiciones aprobados. El botón de WhatsApp <strong>«Quiero aprobar»</strong> registra la intención, no un pago. Un vendedor autorizado confirma la aceptación comercial conforme a la política del cliente.</p>
    <p><Link href="/crm/quotations" className="button">Abrir cotizaciones</Link>{" "}<Link href="/crm/inbox" className="button">Abrir conversaciones</Link></p>
    <p className="muted">Hasta que conectemos YCloud y validemos el envío de archivos y botones, ningún PDF ni mensaje sale automáticamente.</p>
   </section>
   <section style={card}>
    <h2>3. Comprobante y conciliación bancaria</h2>
    <p>Tras aceptar la cotización, envía únicamente las cuentas bancarias aprobadas por Family Power. La IA podrá informar cómo pagar, pero <strong>La IA no puede confirmar pagos</strong>. Contabilidad debe consultar la cuenta real antes de marcar un comprobante como recibido.</p>
    <div style={formGrid}>
      <label>Orden vinculada a cotización aceptada<select value={orderId} onChange={e=>setOrderId(e.target.value)}><option value="">Selecciona orden</option>
      {readyOrders.map(o=><option key={o.id} value={o.id}>{o.order_number} · {money(o.total,o.currency)}</option>)}</select></label>
      <label>Comprobante privado<select value={proofId} onChange={e=>setProofId(e.target.value)}><option value="">Selecciona archivo subido</option>
      {files.filter(f=>f.mime_type==="application/pdf"||imageTypes.includes(f.mime_type)).map(f=><option key={f.id} value={f.id}>{f.filename}</option>)}</select></label>
      <label>Monto indicado (no verificado)<input type="number" min="0.01" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="Importe del comprobante"/></label>
    </div>
    <button className="button" type="button" disabled={busy||unsupported||!selectedOrder||!proofId||!Number.isFinite(Number(amount))||Number(amount)<=0||Number(amount)>Number(selectedOrder?.total??0)}
     onClick={()=>void execute("crm_family_submit_receipt",{p_tenant_id:tenantId,p_order_id:orderId,p_evidence_file_id:proofId,p_amount:Number(amount)})}>
      Registrar comprobante como pendiente de revisión
    </button>
    <div style={{display:"grid",gap:10,marginTop:18}}>
      {receipts.filter(r=>r.status==="pending").map(r=><div key={r.id} style={{...card,background:"transparent"}}>
       <strong>Orden {orders.find(o=>o.id===r.order_id)?.order_number||"registrada"} · {money(r.amount,r.currency)}</strong>
       <p className="muted">Estado: comprobante recibido, todavía no conciliado. No equivale a cobro ni venta.</p>
       <div style={formGrid}><label>Referencia verificada en el banco<input value={bankReferences[r.id]??""} maxLength={160} onChange={e=>setBankReferences(old=>({...old,[r.id]:e.target.value}))} placeholder="Referencia de movimiento real"/></label>
       <label style={{display:"flex",alignItems:"center",gap:8}}><input type="checkbox" checked={reconciled[r.id]===true} onChange={e=>setReconciled(old=>({...old,[r.id]:e.target.checked}))}/>He verificado el abono en la cuenta real</label></div>
       <div className="top-actions">
        <button type="button" className="button primary" disabled={busy||unsupported||!reconciled[r.id]||(bankReferences[r.id]??"").trim().length<6}
          onClick={()=>void execute("crm_family_verify_receipt",{p_tenant_id:tenantId,p_receipt_id:r.id,p_confirmed:true,p_bank_reference:bankReferences[r.id]})}>Confirmar pago conciliado</button>
        <button type="button" className="button" disabled={busy||unsupported}
          onClick={()=>void execute("crm_family_verify_receipt",{p_tenant_id:tenantId,p_receipt_id:r.id,p_confirmed:false,p_bank_reference:null})}>Rechazar comprobante</button>
       </div>
      </div>)}
      {receipts.filter(r=>r.status==="pending").length===0&&<p className="muted">No hay comprobantes pendientes de revisión.</p>}
    </div>
   </section>
   <section style={card}>
    <h2>4. Venta verificada y Meta</h2>
    <p>Una venta se registra únicamente cuando los comprobantes aprobados cubren el total de la orden. El evento resultante queda <strong>retenido</strong>; no se envía a Meta hasta autorizar una conexión de Conversions API, configurar deduplicación y comprobar atribución y consentimiento.</p>
    <p>{purchases.length} evento(s) de compra registrado(s), {purchases.filter(x=>x.delivery_state==="sent").length} enviado(s) a Meta según la base de datos.</p>
    <Link className="button" href="/crm/marketing">Abrir marketing</Link>{" "}<Link className="button" href="/crm/integrations">Estado de YCloud y Meta</Link>
   </section>
   <p className="muted">Modo de control de lanzamiento: se muestran exclusivamente registros autorizados de Family Power. Los resultados no deben anunciarse como operativos hasta probar la conexión real.</p>
  </>}
 </main>;
}
