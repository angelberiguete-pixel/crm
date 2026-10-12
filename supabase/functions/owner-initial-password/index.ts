import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";

const origin = "https://crm-revenue-os.vercel.app";
const headers = {
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
  "Cache-Control": "no-store",
  "Content-Type": "application/json",
  "Referrer-Policy": "no-referrer",
};
const response = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers });

Deno.serve(async (req: Request) => {
  if (req.headers.get("origin") !== origin) return response(403, { error: "Origen no autorizado" });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return response(405, { error: "Método no permitido" });
  try {
    const body = await req.json() as { ticket?: unknown };
    const ticket = body?.ticket;
    if (typeof ticket !== "string" || !/^[A-Za-z0-9_-]{40,80}$/.test(ticket)) {
      return response(400, { error: "Enlace inválido o caducado" });
    }
    const tokenHash = Array.from(new Uint8Array(await crypto.subtle.digest(
      "SHA-256", new TextEncoder().encode(ticket)
    ))).map((b) => b.toString(16).padStart(2, "0")).join("");
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return response(503, { error: "Servicio de activación no configurado" });
    const admin = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
    // Atomic, service-role-only DB claim: no caller can mint or replay a ticket.
    const { data: ownerId, error: claimError } = await admin.rpc(
      "claim_owner_bootstrap_ticket", { p_sha256: tokenHash }
    );
    if (claimError || typeof ownerId !== "string") {
      return response(400, { error: "Este enlace ya se utilizó, no existe o ha caducado" });
    }
    const { data: account, error: accountError } = await admin.auth.admin.getUserById(ownerId);
    if (accountError || !account.user?.email || !account.user.email_confirmed_at) {
      return response(503, { error: "No se pudo verificar la cuenta propietaria" });
    }
    // Admin generateLink creates a recovery OTP without sending an email.
    const { data: recovery, error: recoveryError } = await admin.auth.admin.generateLink({
      type: "recovery",
      email: account.user.email,
      options: { redirectTo: origin + "/first-access" }
    });
    const otpHash = recovery?.properties?.hashed_token;
    if (recoveryError || typeof otpHash !== "string" || !otpHash) {
      return response(503, { error: "No se pudo crear el acceso inicial" });
    }
    return response(200, { token_hash: otpHash, owner_id: ownerId });
  } catch {
    return response(400, { error: "No se pudo procesar la activación" });
  }
});
