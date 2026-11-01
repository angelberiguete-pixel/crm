"use client";

import Image from "next/image";
import {useEffect,useState} from "react";
import BrandLogo from "@/components/brand-logo";

type Identity="family-power"|"platform"|null;
type Size="loading"|"login"|"compact";

/** Public route fallbacks run OUTSIDE TenantBrandProvider. Never guess that an
 * unknown company is the agency; read presentation-only Family Power intent.
 * All access controls still come from authenticated Supabase tenant membership.
 */
export default function RouteLoadingBrand({size="loading"}:{size?:Size}){
 const [identity,setIdentity]=useState<Identity>(null);
 useEffect(()=>{
  let intent="";
  try{intent=window.sessionStorage.getItem("crm:login-intent")??"";}catch{}
  const path=window.location.pathname;
  if(path==="/family-power"||path.startsWith("/family-power/")||
    ((path==="/crm"||path.startsWith("/crm/"))&&intent==="family-power")){
   setIdentity("family-power");
  }else if(path==="/login"||path.startsWith("/platform-admin")||
    path.startsWith("/look-social-media")||path.startsWith("/agency")){
   setIdentity("platform");
  }else{
   setIdentity(null);
  }
 },[]);
 if(identity==="family-power")return <span data-loading-brand="family-power"
  className={"look-brand-logo tenant-customer-logo look-brand-logo--"+size}>
  <Image src="/client-brands/family-power/logo-color-sin-fondo.svg" width={220} height={110}
   alt="Family Power" priority unoptimized/>
 </span>;
 if(identity==="platform")return <BrandLogo size={size}/>;
 // Neutral initial SSR/first-paint state prevents incorrect agency-logo flashes.
 return <span className="route-loading-neutral" aria-hidden="true" data-loading-brand="neutral"/>;
}
