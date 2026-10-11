// Only preserve an explicit server selection or an unambiguous sole membership.
export function resolveTenantContext<T extends { is_active: boolean | null }>(memberships: T[]): T | null {
  const active = memberships.filter(membership => membership.is_active === true);
  if (active.length === 1) return active[0];
  if (active.length > 1) return null;
  return memberships.length === 1 ? memberships[0] : null;
}
