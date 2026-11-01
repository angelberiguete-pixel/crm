"use client";

import Link from "next/link";
import {useEffect,useMemo,useState,type FormEvent} from "react";
import {FileText,ImageIcon,Plus,Search,ShieldCheck} from "lucide-react";
import {supabase} from "@/lib/supabase";
import {useActiveTenant} from "@/components/tenant-context";
import {safeTenantAsset} from "@/lib/tenant-brand";
import FamilyPowerEvidenceLibrary from "@/components/family-power-evidence-library";

type Product={
 id:string;sku:string;name:string;description:string|null;status:string;
 sale_price:number;currency:string;metadata:Record<string,unknown>|null;
};
const label=(value:unknown)=>typeof value==="string"?value.trim():"";
const currency=new Intl.NumberFormat("es-DO",{style:"currency",currency:"DOP",maximumFractionDigits:0});
function productPhoto(input:unknown):string|null{
 const url=safeTenantAsset(input);
 if(!url)return null;
 const drive=url.match(/^https:\/\/drive\.google\.com\/file\/d\/([A-Za-z0-9_-]{10,})\//)?.[1];
 return drive?"https://drive.google.com/thumbnail?id="+drive+"&sz=w700":url;
}


export default function FamilyPowerProductCatalog({tenantId}:{tenantId:string}){
 const tenant=useActiveTenant();
 const admin=tenant?.tenant_slug==="family-power"&&["owner","admin"].includes(tenant.membership_role);
 const [products,setProducts]=useState<Product[]>([]);
 const [loading,setLoading]=useState(true),[error,setError]=useState("");
 const [search,setSearch]=useState(""),[category,setCategory]=useState("all");
 const [selected,setSelected]=useState<string|null>(null);
 const [newProduct,setNewProduct]=useState(false),[saving,setSaving]=useState(false);
 const [refresh,setRefresh]=useState(0);
 const [name,setName]=useState(""),[sku,setSku]=useState(""),[brand,setBrand]=useState("");
 const [edit,setEdit]=useState({brand:"",model:"",category:"",price:"",imageUrl:"",sheetUrl:"",certified:false});
 const [model,setModel]=useState(""),[kind,setKind]=useState("");
 useEffect(()=>{
  let alive=true;setProducts([]);setSelected(null);setLoading(true);setError("");
  void supabase.from("products").select("id,sku,name,description,status,sale_price,currency,metadata")
   .eq("tenant_id",tenantId).order("name").limit(500)
   .then(({data,error:err})=>{
    if(!alive)return;
    if(err)setError("No se pudo cargar el catálogo.");
    else setProducts((data??[]) as Product[]);
    setLoading(false);
   }).then(undefined,()=>{if(alive){setError("Error de conexión con el catálogo.");setLoading(false);}});
  return()=>{alive=false;};
 },[tenantId,refresh]);
 const categories=useMemo(()=>Array.from(new Set(products.map(p=>label(p.metadata?.category)).filter(Boolean))).sort(),[products]);
 const visible=useMemo(()=>products.filter(p=>{
  const m=p.metadata??{};
  const all=[p.name,p.sku,label(m.brand),label(m.model),label(m.category)].join(" ").toLowerCase();
  return (category==="all"||label(m.category)===category)&&all.includes(search.trim().toLowerCase());
 }),[products,category,search]);
 useEffect(()=>{
  const current=products.find(p=>p.id===selected);
  if(!current)return;
  const m=current.metadata??{};
  setEdit({
   brand:label(m.brand),model:label(m.model),category:label(m.category),
   price:current.sale_price>0?String(current.sale_price):"",
   imageUrl:label(m.image_url??m.photo_url),sheetUrl:label(m.technical_sheet_url??m.spec_sheet_url),
   certified:current.status==="active"&&m.verification_status==="approved"
  });
 },[selected,products]);
 async function saveProduct(e:FormEvent){
  e.preventDefault();
  if(!admin||saving||!selected)return;
  const current=products.find(p=>p.id===selected);
  if(!current)return;
  const price=Number(edit.price);
  const image=edit.imageUrl.trim()?safeTenantAsset(edit.imageUrl):null;
  const sheet=edit.sheetUrl.trim()?safeTenantAsset(edit.sheetUrl):null;
  if(edit.imageUrl.trim()&&!image){setError("URL de foto no válida.");return;}
  if(edit.sheetUrl.trim()&&!sheet){setError("URL de ficha no válida.");return;}
  if(edit.certified&&(!edit.model.trim()||!sheet||!image||!Number.isFinite(price)||price<=0)){
   setError("Para verificar: modelo, foto, ficha técnica y precio aprobado.");return;
  }
  setSaving(true);setError("");
  try{
   const currentUser=await supabase.auth.getUser();
   if(currentUser.error||!currentUser.data.user)throw Error("auth");
   const meta={...(current.metadata??{}),brand:edit.brand.trim(),model:edit.model.trim(),
    category:edit.category.trim(),image_url:image,technical_sheet_url:sheet,
    verification_status:edit.certified?"approved":"pending",
    verified_by:edit.certified?currentUser.data.user.id:null,
    verified_at:edit.certified?new Date().toISOString():null};
   const result=await supabase.from("products").update({
    metadata:meta, sale_price:Number.isFinite(price)&&price>=0?price:0,
    status:edit.certified?"active":"inactive"
   }).eq("tenant_id",tenantId).eq("id",current.id);
   if(result.error)throw result.error;
   setSelected(null);setRefresh(v=>v+1);
  }catch{setError("No se pudo guardar la validación.");}
  finally{setSaving(false);}
 }
 async function add(e:FormEvent){
  e.preventDefault();
  if(!admin||saving||!name.trim()||!sku.trim())return;
  setSaving(true);setError("");
  try{
   const result=await supabase.from("products").insert({
    tenant_id:tenantId,sku:sku.trim(),name:name.trim(),status:"inactive",
    sale_price:0,currency:"DOP",source_system:"crm",
    metadata:{brand:brand.trim(),model:model.trim(),category:kind.trim(),verification_status:"pending"}
   });
   if(result.error)throw result.error;
   setName("");setSku("");setBrand("");setModel("");setKind("");
   setNewProduct(false);setRefresh(v=>v+1);
  }catch{setError("No se pudo guardar. Revisa el código o tus permisos.");}
  finally{setSaving(false);}
 }
 if(tenant?.tenant_slug!=="family-power")return null;
 const chosen=products.find(p=>p.id===selected);
 return <div className="stack gap-16 family-product-catalog">
  <header className="topbar">
   <div><h1>Productos</h1><span className="muted">{loading?"…":products.length+" registrados"}</span></div>
   {admin&&<button className="button primary" type="button" onClick={()=>setNewProduct(v=>!v)}>
    <Plus size={16}/> Nuevo producto
   </button>}
  </header>
  {error&&<div className="notice" role="alert">{error}</div>}
  {admin&&newProduct&&<form className="card stack gap-12" onSubmit={add}>
   <h2>Nuevo producto</h2>
   <div className="form-grid">
    <label>Nombre<input required maxLength={160} value={name} onChange={e=>setName(e.target.value)}/></label>
    <label>SKU / Código<input required maxLength={80} value={sku} onChange={e=>setSku(e.target.value)}/></label>
    <label>Marca<input maxLength={100} value={brand} onChange={e=>setBrand(e.target.value)}/></label>
    <label>Modelo<input maxLength={100} value={model} onChange={e=>setModel(e.target.value)}/></label>
    <label>Categoría<input maxLength={100} value={kind} onChange={e=>setKind(e.target.value)}/></label>
   </div>
   <div className="top-actions"><button className="button primary" disabled={saving} type="submit">{saving?"Guardando…":"Guardar para revisión"}</button>
    <button className="button" type="button" onClick={()=>setNewProduct(false)}>Cancelar</button></div>
  </form>}
  <div className="card">
   <div className="top-actions" style={{alignItems:"center",flexWrap:"wrap"}}>
    <label style={{flex:"1 1 190px"}}>Buscar
     <span style={{display:"flex",alignItems:"center",gap:8}}><Search size={18}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Producto, código o marca"/></span>
    </label>
    <label>Categoría<select value={category} onChange={e=>setCategory(e.target.value)}>
     <option value="all">Todas</option>{categories.map(c=><option key={c} value={c}>{c}</option>)}
    </select></label>
   </div>
   {loading?<p role="status">Cargando productos…</p>:visible.length===0?
    <div className="empty">No hay productos registrados{search?" para esta búsqueda":""}.</div>:
    <div className="family-product-grid">
    {visible.map(p=>{
     const meta=p.metadata??{};
     const image=productPhoto(meta.image_url??meta.photo_url);
     const pdf=safeTenantAsset(meta.technical_sheet_url??meta.spec_sheet_url);
     const approved=p.status==="active"&&meta.verification_status==="approved"&&Number(p.sale_price)>0;
     return <article key={p.id} className="family-product-card">
      <div className="family-product-photo">
       {image?<img src={image} loading="lazy" alt={"Foto de "+p.name} onError={e=>{e.currentTarget.style.display="none";}}/>:<ImageIcon size={42} aria-label="Sin fotografía"/>}
      </div>
      <div className="family-product-info">
       <strong>{p.name}</strong>
       <span className="muted">{[label(meta.brand),label(meta.model)].filter(Boolean).join(" · ")||p.sku}</span>
       <small>{label(meta.category)||"Sin categoría"} · {approved?"Verificado":"Por verificar"}</small>
       <div className="top-actions" style={{gap:8}}>
        <button type="button" className="button small" onClick={()=>setSelected(p.id)}>Ver</button>
        {pdf&&<a className="button small" href={pdf} target="_blank" rel="noopener noreferrer"><FileText size={14}/> Ficha</a>}
        {approved?<Link className="button small primary" href={"/crm/quotations?product="+encodeURIComponent(p.id)}>Cotizar</Link>
         :<button className="button small" type="button" disabled title="Requiere precio y ficha aprobados">Cotizar</button>}
       </div>
      </div>
     </article>;
    })}
    </div>}
  </div>
  {chosen&&<section className="card stack gap-12" aria-label="Detalle de producto">
   <div className="topbar"><h2>{chosen.name}</h2><button className="button" type="button" onClick={()=>setSelected(null)}>Cerrar</button></div>
   <p><strong>SKU:</strong> {chosen.sku}</p>
   <p><strong>Marca:</strong> {label(chosen.metadata?.brand)||"—"} · <strong>Modelo:</strong> {label(chosen.metadata?.model)||"—"}</p>
   {chosen.description&&<p>{chosen.description}</p>}
   <p><ShieldCheck size={16}/> {chosen.status==="active"&&chosen.metadata?.verification_status==="approved"?"Verificado":"Pendiente de validación"}</p>
   {chosen.status==="active"&&chosen.metadata?.verification_status==="approved"&&Number(chosen.sale_price)>0&&<strong>{currency.format(chosen.sale_price)}</strong>}
   {safeTenantAsset(chosen.metadata?.technical_sheet_url??chosen.metadata?.spec_sheet_url)&&<a className="button" href={safeTenantAsset(chosen.metadata?.technical_sheet_url??chosen.metadata?.spec_sheet_url)??"#"} target="_blank" rel="noopener noreferrer">Ver ficha técnica</a>}
   {admin&&<form className="stack gap-12" onSubmit={saveProduct}>
    <h3>Ficha y validación</h3>
    <div className="form-grid">
     <label>Marca<input value={edit.brand} maxLength={100} onChange={e=>setEdit(p=>({...p,brand:e.target.value}))}/></label>
     <label>Modelo<input value={edit.model} maxLength={100} onChange={e=>setEdit(p=>({...p,model:e.target.value}))}/></label>
     <label>Categoría<input value={edit.category} maxLength={100} onChange={e=>setEdit(p=>({...p,category:e.target.value}))}/></label>
     <label>Precio aprobado (RD$)<input type="number" min="0" step="0.01" value={edit.price} onChange={e=>setEdit(p=>({...p,price:e.target.value}))}/></label>
     <label>Foto (URL HTTPS)<input type="url" value={edit.imageUrl} onChange={e=>setEdit(p=>({...p,imageUrl:e.target.value}))}/></label>
     <label>Ficha técnica (URL HTTPS)<input type="url" value={edit.sheetUrl} onChange={e=>setEdit(p=>({...p,sheetUrl:e.target.value}))}/></label>
    </div>
    <label style={{display:"flex",alignItems:"center",gap:8}}><input type="checkbox" checked={edit.certified}
     onChange={e=>setEdit(p=>({...p,certified:e.target.checked}))} style={{width:18}}/>
     Confirmo modelo, foto, ficha y precio verificados</label>
    <button className="button primary" disabled={saving} type="submit">{saving?"Guardando…":"Guardar ficha"}</button>
   </form>}
  </section>}
  {admin&&<FamilyPowerEvidenceLibrary/>}
 </div>;
}
