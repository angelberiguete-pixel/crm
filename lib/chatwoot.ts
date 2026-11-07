/**
 * Server-side Chatwoot API adapter.
 * Never import this module from client components.
 * CHATWOOT_BASE_URL must point to our own Chatwoot instance.
 */
export type ChatwootConversation = { id: number; status?: string; inbox_id?: number };
export type ChatwootMessage = { id: number; content?: string; message_type?: number };
const timeoutMs = 10000;

function config() {
  const raw = process.env.CHATWOOT_BASE_URL;
  const token = process.env.CHATWOOT_API_ACCESS_TOKEN;
  const account = Number(process.env.CHATWOOT_ACCOUNT_ID);
  if (!raw || !token || !Number.isSafeInteger(account) || account <= 0) {
    throw new Error("Chatwoot is not configured");
  }
  const base = new URL(raw);
  if (base.protocol !== "https:" && !(base.hostname === "localhost" && base.protocol === "http:")) {
    throw new Error("Chatwoot must use HTTPS");
  }
  if (base.username || base.password || base.search || base.hash) throw new Error("Invalid Chatwoot URL");
  return { base: base.toString().replace(/\/$/, ""), token, account };
}

export async function chatwootRequest<T>(path: string, options: { method?: "GET" | "POST"; body?: unknown } = {}): Promise<T> {
  const { base, token, account } = config();
  if (!/^\/(?:conversations|contacts|inboxes)(?:\/|\?|$)/.test(path) || path.includes("..") || path.includes("//")) {
    throw new Error("Invalid Chatwoot API path");
  }
  const response = await fetch(`${base}/api/v1/accounts/${account}${path}`, {
    method: options.method ?? "GET",
    headers: { api_access_token: token, ...(options.body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`Chatwoot API error: ${response.status}`);
  return response.json() as Promise<T>;
}

export function verifyChatwootWebhookToken(provided: string | null): boolean {
  const expected = process.env.CHATWOOT_WEBHOOK_TOKEN;
  if (!expected || !provided) return false;
  // Token comparison is constant-time after hashing, avoiding length-based timing leaks.
  const crypto = require("node:crypto") as typeof import("node:crypto");
  return crypto.timingSafeEqual(crypto.createHash("sha256").update(expected).digest(), crypto.createHash("sha256").update(provided).digest());
}
