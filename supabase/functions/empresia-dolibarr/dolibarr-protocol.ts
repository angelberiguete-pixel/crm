// Protocol helpers for the official Dolibarr REST API.
// No secret, IP address, or URL comes from the caller. Only server-owned env vars.
export type DolibarrProduct = {
  id: string; ref: string; label: string; price: number | null;
};

const MAX_RESPONSE_BYTES = 262144;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

export function dolibarrBaseUrl(raw: string): string | null {
  if (raw.length > 500 || !raw || raw.includes("..") || raw.includes("%")) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password || url.search ||
      url.hash || url.port || !url.hostname || !url.pathname.endsWith("/api/index.php") ||
      url.pathname.includes("..") || /%[0-9a-f]{2}/i.test(url.pathname) ||
      url.hostname === "localhost" || url.hostname.endsWith(".local") ||
      url.hostname.endsWith(".internal") || url.hostname.endsWith(".test") ||
      /^\d{1,3}(?:\.\d{1,3}){3}$/.test(url.hostname) || url.hostname.includes(":"))
      return null;
    return url.origin + url.pathname.replace(/\/$/, "");
  } catch { return null; }
}

function smallText(v: unknown, limit = 120): string {
  return typeof v === "string" ? v.trim().slice(0, limit) : "";
}
function safePrice(v: unknown): number | null {
  if (typeof v !== "number" && typeof v !== "string") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 1e9
    ? Math.round(n * 10000) / 10000 : null;
}

export function publicProduct(value: unknown): DolibarrProduct | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const id = row.id ?? row.rowid;
  if ((typeof id !== "string" && typeof id !== "number") ||
      !/^\d{1,12}$/.test(String(id))) return null;
  const ref = smallText(row.ref, 90);
  const label = smallText(row.label ?? row.libelle, 160);
  if (!ref || !label) return null;
  return { id: String(id), ref, label, price: safePrice(row.price) };
}

export async function listDolibarrProducts(
  base: string, apiKey: string, input: { page: number; limit: number },
  request: typeof fetch = fetch,
): Promise<DolibarrProduct[]> {
  const url = dolibarrBaseUrl(base);
  if (!url || !apiKey || apiKey.length > 500) throw Error("provider_configuration_invalid");
  if (!Number.isSafeInteger(input.page) || input.page < 0 || input.page > 100 ||
      !Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 25)
    throw Error("invalid_pagination");

  const endpoint = new URL(url + "/products");
  endpoint.searchParams.set("limit", String(input.limit));
  endpoint.searchParams.set("page", String(input.page));
  const response = await request(endpoint, {
    method: "GET", redirect: "error", cache: "no-store",
    headers: { DOLAPIKEY: apiKey, Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  });

  if (response.status === 401 || response.status === 403)
    throw Error("provider_permission_denied");
  if (!response.ok) throw Error("provider_unavailable");
  const len = Number(response.headers.get("content-length") ?? "0");
  if (len > MAX_RESPONSE_BYTES) throw Error("provider_response_too_large");
  const raw = await response.text();
  if (raw.length > MAX_RESPONSE_BYTES) throw Error("provider_response_too_large");

  let data: unknown;
  try { data = JSON.parse(raw); }
  catch { throw Error("provider_invalid_json"); }
  if (!Array.isArray(data) || data.length > input.limit)
    throw Error("provider_invalid_products");
  return data.map(publicProduct).filter((x): x is DolibarrProduct => x !== null);
}
