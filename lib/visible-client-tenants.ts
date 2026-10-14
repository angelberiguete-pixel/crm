/** Technical environments are preserved for QA but never appear as paying customers. */
export function isCommercialClientTenant(slug:string):boolean {
  return slug!=="look-social-media-demo"&&!slug.startsWith("qa-e2e-");
}
