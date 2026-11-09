"use client";
import Link from "next/link";
import {useEffect,useState} from "react";
import {BarChart3,BrainCircuit,Bot,ClipboardList,CreditCard,FileText,Gauge,Inbox,Package,Settings,Target,Users} from "lucide-react";
import {supabase} from "@/lib/supabase";
import {useActiveTenant} from "@/components/tenant-context";

const modules=[
 ["","Inicio","dashboard",Gauge],
 ["contacts","Clientes","contacts",Users],
 ["revenue","Oportunidades","pipeline",Target],
 ["ml","Inteligencia ML","pipeline",BrainCircuit],
 ["products","Productos","products",Package],
 ["quotations","Cotizaciones","quotations",FileText],
 ["inbox","Conversaciones","inbox",Inbox],
 ["tasks","Tareas","operations",ClipboardList],
 ["arm","Agentes","dashboard",Bot],
 ["reports","Reportes","dashboard",BarChart3],
 ["settings","Configuración","settings",Settings],
 ["pagos","Pagos y suscripción","dashboard",CreditCard]
] as const;
export default function FamilyPowerMenu({active,variant}:{active:string;variant:"sidebar"|"mobile"}){
 const tenant=useActiveTenant();
 const [permissions,setPermissions]=useState<Record<string,unknown>|null>(null);
 const [enabled,setEnabled]=useState<Record<string,boolean>>({});
 useEffect(()=>{
  let live=true;setPermissions(null);setEnabled({});
  if(tenant?.tenant_slug!=="family-power")return()=>{live=false;};
  void Promise.all([
   supabase.rpc("tenant_current_permissions",{p_tenant_id:tenant.tenant_id}),
   supabase.rpc("tenant_effective_modules",{p_tenant_id:tenant.tenant_id})
  ]).then(([p,m])=>{
   if(!live||p.error||m.error)return;
   setPermissions((p.data??{}) as Record<string,unknown>);
   const map:Record<string,boolean>={};
   for(const mod of (m.data??[]) as Array<{module_key:string;enabled:boolean}>)
    map[mod.module_key]=mod.enabled;
   setEnabled(map);
  }).then(undefined,()=>{if(live)setPermissions(null);});
  return()=>{live=false;};
 },[tenant?.tenant_id,tenant?.tenant_slug]);
 if(tenant?.tenant_slug!=="family-power")return null;
 const visible=modules.filter(([key,,permission])=>{
  if(["settings","pagos"].includes(key)&&!["owner","admin"].includes(tenant.membership_role))return false;
  return !!permissions&&(permissions.all===true||permissions[permission]===true)&&enabled[permission]!==false;
 });
 const shown=variant==="mobile"?visible.slice(0,5):visible;
 return <nav className={variant==="mobile"?"mobile-nav":"nav"} aria-label="Módulos de Family Power">
  {shown.map(([key,label,,Icon])=><Link key={key} href={"/crm"+(key?"/"+key:"")}
   className={active===key?"active":""} aria-current={active===key?"page":undefined}>
   <Icon size={variant==="mobile"?19:17}/><span>{label}</span>
  </Link>)}
 </nav>;
}
