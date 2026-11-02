"use client";
import {useEffect,useMemo,useState,type FormEvent} from "react";
import {FileDown,FileText,Plus,Printer,Search,Send,Trash2,X} from "lucide-react";
import {supabase} from "@/lib/supabase";
import {buildFamilyQuotePdf,type QuotePdfData} from "@/lib/family-power-quote-pdf";
import styles from "./family-power-quotations.module.css";

type Person={id:string;display_name:string;phone:string|null;whatsapp_phone:string|null};
type Catalog={id:string;sku:string;name:string;sale_price:number;status:string;metadata:Record<string,unknown>|null};
type Line={key:string;product_id:string|null;description:string;quantity:number;unit_price:number};
type SavedLine={id:string;quotation_id:string;product_id:string|null;description:string;quantity:number;unit_price:number};
type Quote={id:string;quote_number:string;contact_id:string|null;status:string;total:number;notes:string|null;valid_until:string|null;metadata:Record<string,unknown>|null;created_at:string};
const money=(n:number)=>new Intl.NumberFormat("es-DO",{style:"currency",currency:"DOP",minimumFractionDigits:2,maximumFractionDigits:2}).format(n);
const date=(s:string)=>new Intl.DateTimeFormat("es-DO",{dateStyle:"medium",timeZone:"America/Santo_Domingo"}).format(new Date(s));
const validPhone=(s:string)=>s.replace(/[^\d]/g,"").slice(0,15);
const number=(s:string)=>Number(s);
const label=(v:unknown)=>typeof v==="string"?v.trim():"";
const createKey=()=>crypto.randomUUID();

export default function FamilyPowerQuotations({tenantId}:{tenantId:string}){
 const [quotes,setQuotes]=useState<Quote[]>([]);
 const [people,setPeople]=useState<Person[]>([]);
 const [catalog,setCatalog]=useState<Catalog[]>([]);
 const [savedLines,setSavedLines]=useState<SavedLine[]>([]);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[revision,setRevision]=useState(0);
 const [error,setError]=useState(""),[success,setSuccess]=useState("");
 const [personId,setPersonId]=useState(""),[clientName,setClientName]=useState(""),[clientPhone,setClientPhone]=useState("");
 const [validUntil,setValidUntil]=useState(""),[notes,setNotes]=useState("");
 const [lines,setLines]=useState<Line[]>([]);
 const [catalogId,setCatalogId]=useState(""),[description,setDescription]=useState(""),[quantity,setQuantity]=useState("1"),[unitPrice,setUnitPrice]=useState("");
 const [search,setSearch]=useState(""),[previewId,setPreviewId]=useState<string|null>(null),[previewUrl,setPreviewUrl]=useState("");
 const [shareReviewed,setShareReviewed]=useState(false);
 const [quoteStatusBusy,setQuoteStatusBusy]=useState(false);

 useEffect(()=>{
   let active=true;setLoading(true);setError("");
   void (async()=>{
     const [q,p,c,i]=await Promise.all([
       supabase.from("quotations").select("id,quote_number,contact_id,status,total,notes,valid_until,metadata,created_at").eq("tenant_id",tenantId).order("created_at",{ascending:false}).limit(300),
       supabase.from("contacts").select("id,display_name,phone,whatsapp_phone").eq("tenant_id",tenantId).order("display_name").limit(500),
       supabase.from("products").select("id,sku,name,sale_price,status,metadata").eq("tenant_id",tenantId).order("name").limit(500),
       supabase.from("quotation_items").select("id,quotation_id,product_id,description,quantity,unit_price").eq("tenant_id",tenantId).order("position").limit(3000)
     ]);
     if(!active)return;
     const failure=q.error??p.error??c.error??i.error;
     if(failure)setError("No se pudo cargar el módulo: "+failure.message);
     if(!q.error)setQuotes(((q.data??[]) as Quote[]).map(v=>({...v,total:Number(v.total)})));
     if(!p.error)setPeople((p.data??[]) as Person[]);
     if(!c.error)setCatalog(((c.data??[]) as Catalog[]).map(v=>({...v,sale_price:Number(v.sale_price)})));
     if(!i.error)setSavedLines(((i.data??[]) as SavedLine[]).map(v=>({...v,quantity:Number(v.quantity),unit_price:Number(v.unit_price)})));
     setLoading(false);
   })().catch(()=>{if(active){setError("Error de conexión con cotizaciones.");setLoading(false);}});
   return()=>{active=false};
 },[tenantId,revision]);

 const approved=useMemo(()=>catalog.filter(p=>p.status==="active"&&p.metadata?.verification_status==="approved"&&p.sale_price>0),[catalog]);
 const total=lines.reduce((a,l)=>a+l.quantity*l.unit_price,0);
 const matches=quotes.filter(q=>[q.quote_number,clientFor(q),date(q.created_at)].join(" ").toLowerCase().includes(search.toLowerCase().trim()));
 const preview=quotes.find(q=>q.id===previewId)??null;
 const previewItems=savedLines.filter(l=>l.quotation_id===previewId);
 function clientFor(q:Quote){return label(q.metadata?.customer_name_snapshot)||people.find(p=>p.id===q.contact_id)?.display_name||"Cliente";}
 function phoneFor(q:Quote){const p=people.find(v=>v.id===q.contact_id);return p?.whatsapp_phone??p?.phone??label(q.metadata?.customer_phone_snapshot);}
 function dataFor(q:Quote):QuotePdfData{
   return {number:q.quote_number,client:clientFor(q),phone:phoneFor(q),createdAt:q.created_at,
     validUntil:q.valid_until,notes:q.notes,total:q.total,status:q.status,
     lines:savedLines.filter(l=>l.quotation_id===q.id).map(l=>({description:l.description,quantity:l.quantity,unit_price:l.unit_price}))};
 }
 function pdfBlob(q:Quote){
   const data=buildFamilyQuotePdf(dataFor(q));
   return new Blob([new Uint8Array(data).buffer as ArrayBuffer],{type:"application/pdf"});
 }
 useEffect(()=>{
   if(!preview){setPreviewUrl("");return;}
   let objectUrl="";
   try{objectUrl=URL.createObjectURL(pdfBlob(preview));setPreviewUrl(objectUrl);}
   catch{setPreviewUrl("");}
   return()=>{if(objectUrl)URL.revokeObjectURL(objectUrl);};
 // The persisted lines are refreshed whenever the selected quotation changes.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[previewId,savedLines,quotes,people]);
 useEffect(()=>{
   if(!previewId)return;
   const onKey=(e:KeyboardEvent)=>{if(e.key==="Escape")setPreviewId(null);};
   window.addEventListener("keydown",onKey);return()=>window.removeEventListener("keydown",onKey);
 },[previewId]);

 function pickPerson(id:string){
   setPersonId(id);
   const p=people.find(v=>v.id===id);
   if(p){setClientName(p.display_name);setClientPhone(p.whatsapp_phone??p.phone??"");}
 }
 function pickCatalog(id:string){
   setCatalogId(id);const p=approved.find(v=>v.id===id);
   if(p){setDescription(p.name);setUnitPrice(String(p.sale_price));}
   else{setDescription("");setUnitPrice("");}
 }
 function addLine(e:FormEvent){
   e.preventDefault();setError("");setSuccess("");
   const q=number(quantity),price=number(unitPrice),name=description.trim();
   if(!name||name.length>240||!Number.isInteger(q)||q<1||q>10000||!Number.isFinite(price)||price<0||price>100000000)
     return setError("Revisa el nombre del artículo, la cantidad y el precio unitario.");
   // A modified catalog price becomes a manually proposed price, not an "approved" catalog price.
   const approvedItem=approved.find(p=>p.id===catalogId);
   const id=approvedItem&&approvedItem.name===name&&Math.abs(approvedItem.sale_price-price)<0.001?approvedItem.id:null;
   setLines(v=>[...v,{key:createKey(),product_id:id,description:name,quantity:q,unit_price:price}]);
   setCatalogId("");setDescription("");setQuantity("1");setUnitPrice("");
 }
 async function createQuote(){
   setError("");setSuccess("");
   const name=clientName.trim(),phone=clientPhone.trim();
   if(name.length<2||name.length>160)return setError("Escribe el nombre del cliente.");
   if(phone&&validPhone(phone).length<8)return setError("Revisa el teléfono del cliente.");
   if(!lines.length)return setError("Agrega al menos un producto, con su cantidad y precio.");
   if(lines.some(l=>!l.description||!Number.isInteger(l.quantity)||l.quantity<=0||!Number.isFinite(l.unit_price)||l.unit_price<0))return setError("Los artículos tienen importes inválidos.");
   if(!Number.isFinite(total)||total<=0)return setError("La cotización debe tener un total positivo.");
   setBusy(true);
   try{
     let id=personId;const known=people.find(v=>v.id===id);
     if(known&&known.display_name!==name)id="";
     if(!id&&phone)id=people.find(v=>[v.whatsapp_phone,v.phone].some(s=>s&&validPhone(s)===validPhone(phone)))?.id??"";
     if(!id)id=people.find(v=>v.display_name.toLocaleLowerCase()===name.toLocaleLowerCase()&&(!phone||validPhone(v.whatsapp_phone??v.phone??"")===validPhone(phone)))?.id??"";
     if(!id){
       const c=await supabase.from("contacts").insert({tenant_id:tenantId,display_name:name,phone:phone||null,whatsapp_phone:phone||null,source:"manual",status:"lead"}).select("id").single();
       if(c.error)throw Error("No se pudo registrar el cliente: "+c.error.message);
       id=c.data.id;
     }
     const quoteNumber="FP-"+Date.now().toString(36).toUpperCase()+"-"+crypto.randomUUID().slice(0,5).toUpperCase();
     const amount=Math.round(total*100)/100;
     const q=await supabase.from("quotations").insert({tenant_id:tenantId,quote_number:quoteNumber,contact_id:id,status:"draft",currency:"DOP",
       valid_until:validUntil||null,notes:notes.trim()||null,subtotal:amount,tax_total:0,discount_total:0,total:amount,
       metadata:{customer_name_snapshot:name,customer_phone_snapshot:phone,prepared_in:"family_power_crm"}}).select("id").single();
     if(q.error)throw Error("No se pudo crear la cotización: "+q.error.message);
     const items=await supabase.from("quotation_items").insert(lines.map((l,i)=>({
       tenant_id:tenantId,quotation_id:q.data.id,product_id:l.product_id,position:i+1,description:l.description,
       quantity:l.quantity,unit_price:l.unit_price,discount_percent:0,tax_rate:0
     })));
     if(items.error){
       setRevision(v=>v+1);
       throw Error("Se creó el borrador "+quoteNumber+", pero falló el guardado de artículos. Revísalo antes de continuar: "+items.error.message);
     }
     setClientName("");setClientPhone("");setPersonId("");setValidUntil("");setNotes("");setLines([]);setShareReviewed(false);
     setSuccess("Cotización "+quoteNumber+" guardada. Selecciónala debajo para ver, imprimir o compartir su PDF.");
     setRevision(v=>v+1);
   }catch(e){setError(e instanceof Error?e.message:"No se pudo guardar.");}
   finally{setBusy(false);}
 }
 function download(q:Quote){
   try{
     const url=URL.createObjectURL(pdfBlob(q)),a=document.createElement("a");
     a.href=url;a.download=q.quote_number+".pdf";document.body.append(a);a.click();a.remove();
     window.setTimeout(()=>URL.revokeObjectURL(url),10000);
   }catch{setError("La cotización necesita productos guardados para generar el PDF.");}
 }
 async function share(q:Quote){
   setError("");setSuccess("");
   if(!shareReviewed)return setError("Confirma que verificaste los precios y productos antes de compartir.");
   if(!savedLines.some(l=>l.quotation_id===q.id))return setError("La cotización no tiene artículos.");
   const phone=validPhone(phoneFor(q)??"");
   if(!phone)return setError("Este cliente no tiene teléfono. Edita su contacto para compartir por WhatsApp.");
   const message="Hola "+clientFor(q)+", te compartimos la cotización "+q.quote_number+" de Family Power. Total: "+money(q.total)+".";
   const file=new File([new Uint8Array(buildFamilyQuotePdf(dataFor(q))).buffer as ArrayBuffer],q.quote_number+".pdf",{type:"application/pdf"});
   try{
     if(typeof navigator.share==="function"&&typeof navigator.canShare==="function"&&navigator.canShare({files:[file]})){
       await navigator.share({files:[file],title:"Cotización Family Power",text:message});
       setSuccess("Se abrió el menú para compartir el PDF. Confirma el destinatario en WhatsApp.");
       return;
     }
   }catch(e){
     if((e as Error)?.name==="AbortError")return;
   }
   download(q);
   window.open("https://wa.me/"+phone+"?text="+encodeURIComponent(message),"_blank","noopener,noreferrer");
   setSuccess("Se descargó el PDF y se abrió WhatsApp. Adjunta el archivo manualmente; no se envió ningún mensaje automáticamente.");
 }
 async function markSent(q:Quote){
   if(!shareReviewed)return setError("Verifica los importes y confirma la revisión.");
   setQuoteStatusBusy(true);setError("");
   const r=await supabase.from("quotations").update({status:"sent"}).eq("tenant_id",tenantId).eq("id",q.id).eq("status","draft");
   if(r.error)setError(r.error.message);else{setSuccess("Cotización marcada como enviada; confirma por separado la entrega real.");setRevision(v=>v+1);}
   setQuoteStatusBusy(false);
 }
 return <div className={styles.root}>
   <section className="card">
     <div className={styles.sectionHead}><h2>Nueva cotización</h2><span className={styles.hint}>Un formulario · cliente, artículos e importes</span></div>
     <form onSubmit={e=>{e.preventDefault();void createQuote();}} className={styles.form}>
       <div className={styles.grid}>
         <label>Contacto registrado (opcional)
           <select value={personId} onChange={e=>pickPerson(e.target.value)}><option value="">Escribir nuevo cliente</option>
             {people.map(p=><option key={p.id} value={p.id}>{p.display_name}</option>)}</select>
         </label>
         <label>Nombre del cliente *
           <input value={clientName} maxLength={160} onChange={e=>{setClientName(e.target.value);setPersonId("");}} placeholder="Nombre proporcionado por el cliente" required/>
         </label>
         <label>Teléfono / WhatsApp
           <input type="tel" value={clientPhone} maxLength={25} onChange={e=>setClientPhone(e.target.value)} placeholder="Ej. +1 809 000 0000"/>
         </label>
         <label>Válida hasta <input type="date" value={validUntil} onChange={e=>setValidUntil(e.target.value)}/></label>
       </div>
       <label>Notas comerciales <textarea rows={2} maxLength={1000} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Condiciones verificadas para esta cotización"/></label>
       <h3>Productos y cantidades</h3>
       <p className="muted">Elige un producto verificado o escribe un artículo con el precio propuesto por el vendedor. No se asignan precios automáticamente.</p>
     </form>
     <form onSubmit={addLine} className={styles.lineForm}>
       <label>Catálogo aprobado <select value={catalogId} onChange={e=>pickCatalog(e.target.value)}><option value="">Artículo manual</option>{approved.map(p=><option key={p.id} value={p.id}>{p.name} · {money(p.sale_price)}</option>)}</select></label>
       <label>Artículo * <input value={description} onChange={e=>{setDescription(e.target.value);if(catalogId)setCatalogId("");}} maxLength={240} required placeholder="Producto o servicio"/></label>
       <label>Cantidad * <input type="number" min="1" max="10000" step="1" value={quantity} onChange={e=>setQuantity(e.target.value)} required/></label>
       <label>Precio unitario (RD$) * <input type="number" min="0" step=".01" value={unitPrice} onChange={e=>{setUnitPrice(e.target.value);if(catalogId)setCatalogId("");}} required/></label>
       <button type="submit" className="button"><Plus size={16}/> Añadir</button>
     </form>
     {lines.length>0&&<div className={styles.lines}>{lines.map(l=><div key={l.key} className={styles.line}><div><strong>{l.description}</strong><small>{l.quantity} × {money(l.unit_price)}</small></div><strong>{money(l.quantity*l.unit_price)}</strong><button type="button" className={styles.iconButton} aria-label={"Quitar "+l.description} onClick={()=>setLines(v=>v.filter(x=>x.key!==l.key))}><Trash2 size={16}/></button></div>)}</div>}
     <div className={styles.total}><span>Total propuesto</span><strong>{money(total)}</strong></div>
     <button className="button primary" type="button" disabled={busy} onClick={()=>void createQuote()}>{busy?"Guardando…":"Guardar cotización completa"}</button>
     <p className="muted">Las cotizaciones se guardan como borradores hasta su revisión comercial.</p>
   </section>
   {error&&<div className="notice" role="alert">{error}</div>}
   {success&&<div className="notice" role="status">{success}</div>}
   <section className="card">
     <div className={styles.sectionHead}><h2>Cotizaciones guardadas</h2><span>{quotes.length} registradas</span></div>
     <label className={styles.search}><Search size={16}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar cliente, fecha o número"/></label>
     {loading?<p role="status">Cargando cotizaciones…</p>:matches.length===0?<p className="muted">No hay cotizaciones que coincidan con la búsqueda.</p>:
     <div className={styles.quoteList}>{matches.map(q=><article key={q.id} className={styles.quoteRow}>
       <div><strong>{clientFor(q)}</strong><div className="muted">{date(q.created_at)} · {q.quote_number}</div><small>{q.status==="draft"?"Borrador":q.status==="sent"?"Enviada":q.status}</small></div>
       <div className={styles.quoteActions}><strong>{money(q.total)}</strong>
         <button className="button small" disabled={!savedLines.some(l=>l.quotation_id===q.id)} onClick={()=>{setPreviewId(q.id);setShareReviewed(false);}}>Ver PDF</button>
       </div>
     </article>)}</div>}
   </section>
   {preview&&<div className={styles.backdrop} role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setPreviewId(null)}}>
     <section className={styles.modal} role="dialog" aria-modal="true" aria-label={"Cotización "+preview.quote_number}>
       <div className={styles.modalHead}><div><strong>{clientFor(preview)}</strong><small>{date(preview.created_at)} · {preview.quote_number}</small></div>
         <button type="button" className={styles.close} aria-label="Cerrar PDF" onClick={()=>setPreviewId(null)}><X size={22}/></button></div>
       <div className={styles.modalActions}>
         <button type="button" className="button small" onClick={()=>download(preview)}><FileDown size={15}/> Descargar PDF</button>
         <button type="button" className="button small" onClick={()=>{const frame=document.getElementById("family-quote-iframe") as HTMLIFrameElement|null;frame?.contentWindow?.focus();frame?.contentWindow?.print();}}><Printer size={15}/> Imprimir</button>
         <button type="button" className="button small primary" onClick={()=>void share(preview)}><Send size={15}/> WhatsApp</button>
       </div>
       <label className={styles.review}><input type="checkbox" checked={shareReviewed} onChange={e=>setShareReviewed(e.target.checked)}/> Confirmo que revisé artículos y precios antes de compartir.</label>
       {preview.status==="draft"&&<button type="button" className="button small" disabled={!shareReviewed||quoteStatusBusy} onClick={()=>void markSent(preview)}>Marcar como enviada (registro manual)</button>}
       {previewUrl?<iframe id="family-quote-iframe" src={previewUrl+"#toolbar=0"} title={"PDF de "+preview.quote_number} className={styles.pdf}/>:<p role="alert">No se pudo generar el PDF; revisa los artículos de esta cotización.</p>}
       <div className={styles.mobileNote}>Vista previa dentro de Family Power. La entrega por WhatsApp requiere elegir y confirmar el destinatario.</div>
     </section>
   </div>}
 </div>;
}
