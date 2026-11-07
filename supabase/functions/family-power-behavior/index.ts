// Public, consent-gated Family Power telemetry ingest.
// Only coarse interaction metadata; no IP address, headers, form values, text content or fingerprint stored.
import { createClient } from "npm:@supabase/supabase-js@2.116.0";

const projectUrl = Deno.env.get("SUPABASE_URL") || "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const db = createClient(projectUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const allowedOrigin = "https://family-power-v136-demo.vercel.app";
const allowedEvents = new Set([
 "page_view","click","scroll_depth","section_dwell","engaged_time",
 "form_start","form_submit","form_error","cta_whatsapp","cta_phone","page_exit",
]);
const uuid = /^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;
function clean(value: unknown, max=64): string | null {
 if (typeof value !== "string") return null;
 const trimmed = value.normalize("NFKC").replace(/[^a-zA-Z0-9 _./-]/g,"").trim().slice(0,max);
 return trimmed || null;
}
const json = (body: object, status=400, origin="") => new Response(JSON.stringify(body),{
 status,headers:{
  "content-type":"application/json; charset=utf-8",
  "cache-control":"no-store",
  "vary":"Origin",
  ...(origin === allowedOrigin ? {
    "access-control-allow-origin":allowedOrigin,
    "access-control-allow-methods":"POST,OPTIONS",
    "access-control-allow-headers":"content-type",
    "access-control-max-age":"600",
  } : {})
 }
});
Deno.serve(async (request: Request) => {
 const origin = request.headers.get("origin") || "";
 if (origin !== allowedOrigin) return json({error:"Origin not allowed"},403);
 if(request.method === "OPTIONS") return json({},200,origin);
 if(request.method !== "POST") return json({error:"Method not allowed"},405,origin);
 if(Number(request.headers.get("content-length") || 0) > 3000)
   return json({error:"Payload too large"},413,origin);
 let parsed: Record<string, unknown>;
 try {
  const raw = await request.text();
  if(raw.length > 3000) return json({error:"Payload too large"},413,origin);
  const incoming = JSON.parse(raw);
  if (!incoming || typeof incoming !== "object" || Array.isArray(incoming))
    throw new Error("Bad input");
  parsed = incoming as Record<string,unknown>;
 } catch {
  return json({error:"Invalid payload"},400,origin);
 }
 const siteId = parsed.site_id, sessionId = parsed.session_id, eventName = parsed.event_name;
 if(typeof siteId !== "string" || typeof sessionId !== "string" ||
   !uuid.test(siteId) || !uuid.test(sessionId) ||
   typeof eventName !== "string" || !allowedEvents.has(eventName)) {
  return json({error:"Invalid telemetry identifiers"},400,origin);
 }
 const { data: site, error: siteError } = await db
  .from("marketing_behavior_sites")
  .select("id,tenant_id,hostname,enabled")
  .eq("id",siteId).eq("enabled",true).maybeSingle();
 if(siteError || !site || site.hostname !== new URL(origin).hostname)
  return json({error:"Site not authorized"},403,origin);

 // Keep per-session event volume bounded. No user identifier or IP is persisted.
 const cutoff = new Date(Date.now() - 3600000).toISOString();
 const { count, error: rateError } = await db.from("marketing_behavior_events")
  .select("id",{head:true,count:"exact"}).eq("site_id",site.id)
  .eq("session_id",sessionId).gte("created_at",cutoff);
 if(rateError) return json({error:"Storage unavailable"},503,origin);
 if((count??0)>=240) return json({error:"Session limit"},429,origin);

 const num = (x: unknown,min:number,max:number) =>
   typeof x==="number" && Number.isFinite(x) && x>=min && x<=max ? x : null;
 const device = ["mobile","tablet","desktop"].includes(String(parsed.device))
   ? String(parsed.device) : "desktop";
 const path = typeof parsed.page_path==="string" &&
   /^\/[a-zA-Z0-9/_-]{0,119}$/.test(parsed.page_path)
   ? parsed.page_path : "/";

 // Supabase edge/request geography may be unavailable. Unknown remains NULL, never guessed.
 const cfGeo = (request as Request & { cf?:{ country?: string }}).cf?.country;
 const countryRaw = cfGeo ?? request.headers.get("cf-ipcountry") ?? "";
 const country = /^[A-Z]{2}$/.test(countryRaw) && !["XX","ZZ","T1"].includes(countryRaw)
   ? countryRaw : null;

 const event = {
  tenant_id:site.tenant_id,site_id:site.id,session_id:sessionId,event_name:eventName,
  page_path:path,device,country,
  section_key:clean(parsed.section_key),
  target_key:clean(parsed.target_key),
  utm_source:clean(parsed.utm_source),
  utm_medium:clean(parsed.utm_medium),
  utm_campaign:clean(parsed.utm_campaign),
  active_seconds:num(parsed.active_seconds,0,7200),
  scroll_percent:num(parsed.scroll_percent,0,100),
  x_percent:num(parsed.x_percent,0,100),
  y_percent:num(parsed.y_percent,0,100),
 };
 const {error: writeError} = await db.from("marketing_behavior_events").insert(event);
 if(writeError) return json({error:"Unable to store event"},503,origin);
 return new Response(null,{status:204,headers:{
  "cache-control":"no-store","vary":"Origin",
  "access-control-allow-origin":allowedOrigin,
 }});
});
