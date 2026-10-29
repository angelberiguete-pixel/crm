/** Presentation helpers only: authorization is always checked on Supabase. */
export const FAMILY_POWER_SLUG="family-power";
export type FamilyPowerAccess={
  tenant_id:string;tenant_slug:string;tenant_name:string;membership_role:string;is_active:boolean;
};
export function familyPowerMembership(memberships:readonly FamilyPowerAccess[]|null|undefined):FamilyPowerAccess|null{
  if(!Array.isArray(memberships))return null;
  return memberships.find(item=>item.tenant_slug===FAMILY_POWER_SLUG&&
    typeof item.tenant_id==="string"&&item.tenant_id.length>=32&&
    ["owner","admin","manager","agent","viewer"].includes(item.membership_role))??null;
}
/** Role names are only UI labels; never grant access based on this mapping. */
export function familyPowerRoleLabel(role:string|null|undefined):string{
  switch(role){
    case "owner":return "Propietario";
    case "admin":return "Administrador";
    case "manager":return "Supervisor comercial";
    case "agent":return "Vendedor";
    case "viewer":return "Consulta";
    default:return "Usuario";
  }
}
