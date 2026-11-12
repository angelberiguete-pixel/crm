"use client";
import Link from "next/link";
import {useEffect,useState} from "react";
import {ArrowRight,CheckCircle2,PackageCheck,ShieldAlert} from "lucide-react";
import {supabase} from "@/lib/supabase";
import {useActiveTenant} from "@/components/tenant-context";
import styles from "./family-power-catalog-readiness.module.css";
type Product={id:string;name:string;status:string;sale_price:number|null;metadata:Record<string,unknown>|null};
export default function FamilyPowerCatalogReadiness(){
 const tenant=useActiveTenant();
 const allowed=tenant?.tenant_slug==="family-power"&&["owner","admin"].includes(tenant.membership_role);
 const id=tenant?.tenant_id;
 const [products,setProducts]=useState<Product[]|null>(null),[error,setError]=useState("");
 useEffect(()=>{
  let live=true;setProducts(null);setError("");
  if(!allowed||!id)return()=>{live=false;};
  void supabase.from("products").select("id,name,status,sale_price,metadata").eq("tenant_id",id).limit(1000)
   .then(({data,error:err})=>{if(!live)return;if(err){setError("No se pudo verificar el catálogo.");return;}setProducts((data??[]) as Product[]);})
   .then(undefined,()=>{if(live)setError("No se pudo consultar el catálogo.");});
  return()=>{live=false;};
 },[allowed,id]);
 if(!allowed)return null;
 const pending=products?.filter(p=>!(p.status==="active"&&p.metadata?.verification_status==="approved"&&Number(p.sale_price)>0));
 return <section className={styles.panel} aria-label="Estado de verificación del catálogo de Family Power">
  <div className={styles.icon}>{products&&pending?.length===0?<CheckCircle2 size={25}/>:<PackageCheck size={25}/>}</div>
  <div className={styles.copy}><span>Catálogo técnico · Verificación de productos</span>
   <h3>{error?"Catálogo no disponible":products===null?"Comprobando fichas…":pending?.length===0?"Productos registrados y verificados":pending?.length+" productos requieren revisión"}</h3>
   <p>{error||"Antes de cotizar, el doctor debe validar el modelo, la ficha técnica y el precio de venta de cada inversor. Los registros pendientes no se consideran productos listos para vender."}</p>
  </div>
  <Link href="/crm/products" className={styles.button}>{pending?.length?<ShieldAlert size={16}/>:<PackageCheck size={16}/>} Revisar catálogo <ArrowRight size={15}/></Link>
 </section>;
}
