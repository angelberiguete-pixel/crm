// Shared, side-effect-free helpers for the Dominican clinic administration pilot.
export const CITA24_TIMEZONE = "America/Santo_Domingo";

export function normalizeContactPhone(value: string): string {
  return value.replace(/[^0-9+]/g, "").slice(0, 24);
}

export function parseClinicLocalDateTime(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  // The Dominican Republic uses UTC-04:00 throughout the year.
  const candidate = new Date(value + ":00-04:00");
  if (!Number.isFinite(candidate.getTime())) return null;
  // Reject rollover dates such as February 31.
  const roundTrip = new Date(candidate.getTime() - 4 * 3600000).toISOString().slice(0, 16);
  return roundTrip === value ? candidate : null;
}

export function slotsOverlap(
  startA: number, endA: number, startB: number, endB: number,
): boolean {
  return startA < endB && startB < endA;
}
