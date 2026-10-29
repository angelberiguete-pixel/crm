"use client";

import {createContext,useContext,useEffect,useMemo,useState,type CSSProperties,type ReactNode} from "react";
import {supabase} from "@/lib/supabase";
import {
  resolveTenantBrand,tenantBrandStyle,
  type TenantIdentity,type TenantBrand,type TenantBrandSettings
} from "@/lib/tenant-brand";

const TenantBrandContext=createContext<TenantBrand|null>(null);
export const TENANT_BRAND_UPDATED="look:tenant-brand-updated";
export function useTenantBrand(){return useContext(TenantBrandContext);}

/** Identity and theme are loaded only AFTER the tenant membership gate succeeds.
 * Switching tenant remounts this provider (keyed by tenant id), so no previous
 * company's name, logo, styles or cached settings can flash into the next.
 */
export default function TenantBrandProvider({tenant,children}:{tenant:TenantIdentity;children:ReactNode}){
 const [settings,setSettings]=useState<TenantBrandSettings|null>(null);
 const [loading,setLoading]=useState(true);
 const fallback=useMemo(()=>resolveTenantBrand(tenant),[tenant]);
 const brand=useMemo(()=>resolveTenantBrand(tenant,settings),[tenant,settings]);
 useEffect(()=>{
   let active=true;
   const load=async()=>{
     const response=await supabase.from("tenant_settings")
       .select("brand_name,logo_url,favicon_url,primary_color,secondary_color,accent_color,settings")
       .eq("tenant_id",tenant.tenant_id).maybeSingle();
     if(!active)return;
     // Never use settings from a failed query or from another tenant.
     setSettings(response.error?null:response.data as TenantBrandSettings|null);
     setLoading(false);
   };
   const changed=(event:Event)=>{
     const detail=(event as CustomEvent<{tenantId?:string}>).detail;
     if(detail?.tenantId!==tenant.tenant_id)return;
     void load();
   };
   window.addEventListener(TENANT_BRAND_UPDATED,changed);
   void load().catch(()=>{if(active){setSettings(null);setLoading(false);}});
   return()=>{active=false;window.removeEventListener(TENANT_BRAND_UPDATED,changed);};
 },[tenant.tenant_id]);
 useEffect(()=>{
   if(loading)return;
   const previous=document.title;
   document.title=brand.name+" | CRM";
   let favicon=document.querySelector<HTMLLinkElement>('link[rel="icon"]');
   const created=!favicon;
   if(!favicon){
     favicon=document.createElement("link");
     favicon.rel="icon";
     document.head.appendChild(favicon);
   }
   const originalHref=favicon.getAttribute("href");
   favicon.href=brand.faviconUrl??(brand.officialLookBrand?"/look-social-media-logo.svg":"/tenant-crm-icon.svg");
   return()=>{
     document.title=previous;
     if(created)favicon.remove();
     else if(originalHref!==null)favicon.setAttribute("href",originalHref);
   };
 },[brand,loading]);
 if(loading)return <div className="loading" role="status">Preparando el espacio de {fallback.name}…</div>;
 return <TenantBrandContext.Provider value={brand}>
   <div className="tenant-brand-scope" data-tenant-brand={brand.slug}
     style={tenantBrandStyle(brand) as CSSProperties}>
     {children}
   </div>
 </TenantBrandContext.Provider>;
}
