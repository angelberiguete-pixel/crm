"use client";

import Image from "next/image";
import {useTenantBrand} from "@/components/tenant-brand-provider";

export default function BrandLogo({size="sidebar",label=true}:{size?:"sidebar"|"login"|"compact"|"loading";label?:boolean}){
  const tenantBrand=useTenantBrand();
  const officialLogo=!tenantBrand||(tenantBrand.officialLookBrand&&!tenantBrand.logoUrl);
  const officialAsset=size==="sidebar"?"/look-social-media-logo-on-dark.svg":"/look-social-media-logo-transparent.svg";
  if(officialLogo)return <span className={"look-brand-logo look-brand-logo--official look-brand-logo--"+size}>
    <Image src={officialAsset} alt={label?"LOOK SOCIAL MEDIA":""}
      width={220} height={182} priority={size==="login"} unoptimized/>
  </span>;
  return <span className={"look-brand-logo tenant-customer-logo look-brand-logo--"+size}>
    {tenantBrand.logoUrl?<Image src={tenantBrand.logoUrl}
      alt={label?"Logo de "+tenantBrand.name:""}
      width={220} height={182} priority={size==="login"} unoptimized/>:
    <span className="tenant-customer-initials" role={label?"img":undefined}
      aria-label={label?"Logo de "+tenantBrand.name:undefined} aria-hidden={!label}
      style={{backgroundColor:tenantBrand.primaryColor}}>
      {tenantBrand.initials}
    </span>}
  </span>;
}
