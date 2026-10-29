export type TenantIdentity = {tenant_id:string;tenant_slug:string;tenant_name:string};
export type TenantBrandSettings = {
  brand_name?:string|null;logo_url?:string|null;favicon_url?:string|null;
  primary_color?:string|null;secondary_color?:string|null;accent_color?:string|null;
  custom_domain?:string|null;
};
export type TenantBrand = {
  name:string;slug:string;logoUrl:string|null;faviconUrl:string|null;
  primaryColor:string;secondaryColor:string;accentColor:string;
  initials:string;officialLookBrand:boolean;
};
export const DEFAULT_LOOK_COLORS={primary:"#2563EB",secondary:"#7C3AED",accent:"#00D4FF"};
const COLOR=/^#[0-9a-fA-F]{6}$/;
export function safeHex(input:unknown,fallback:string):string{
  return typeof input==="string"&&COLOR.test(input)?input.toUpperCase():fallback;
}
/** Avoid data:, javascript:, protocol-relative, credentials and insecure http: images. */
export function safeTenantAsset(input:unknown):string|null{
  if(typeof input!=="string"||input.length>1200)return null;
  const value=input.trim();
  if(value.startsWith("/")&&!value.startsWith("//")&&!value.includes("\\")&&
     /^\/[a-zA-Z0-9/_\-.%]+$/.test(value)&&!value.includes(".."))return value;
  try{
    const uri=new URL(value);
    if(uri.protocol==="https:"&&!uri.username&&!uri.password&&uri.hostname&&
       !uri.hostname.endsWith(".local"))return uri.toString();
  }catch{}
  return null;
}
export function resolveTenantBrand(identity:TenantIdentity,settings?:TenantBrandSettings|null):TenantBrand{
  const officialLookBrand=identity.tenant_slug==="eurevector";
  const rawName=typeof settings?.brand_name==="string"?settings.brand_name.trim():"";
  const name=rawName.slice(0,100)||identity.tenant_name.trim().slice(0,100)||"Mi empresa";
  const firstLetters=name.split(/\s+/).slice(0,2).map(word=>word.charAt(0).toUpperCase()).join("");
  const defaults=officialLookBrand?DEFAULT_LOOK_COLORS:{primary:"#334155",secondary:"#64748B",accent:"#0891B2"};
  return {
    name,slug:identity.tenant_slug,
    logoUrl:safeTenantAsset(settings?.logo_url),
    faviconUrl:safeTenantAsset(settings?.favicon_url),
    primaryColor:safeHex(settings?.primary_color,defaults.primary),
    secondaryColor:safeHex(settings?.secondary_color,defaults.secondary),
    accentColor:safeHex(settings?.accent_color,defaults.accent),
    initials:firstLetters||"CRM",officialLookBrand,
  };
}
export function tenantBrandStyle(brand:TenantBrand):Record<string,string>{
  return {
    "--accent":brand.primaryColor,"--accent2":brand.accentColor,
    "--brand-blue":brand.primaryColor,"--brand-violet":brand.secondaryColor,
    "--brand-cyan":brand.accentColor,
    "--brand-gradient":"linear-gradient(135deg,"+brand.primaryColor+" 0%,"+brand.accentColor+" 52%,"+brand.secondaryColor+" 100%)",
  };
}
