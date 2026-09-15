import { createClient } from "@supabase/supabase-js";

// Canonical production Supabase project for Eurevector CRM.
// Keep this explicit so stale Vercel environment variables cannot silently point
// the production login at a different Supabase project.
const url = "https://ygipjqgyreeahslzorik.supabase.co";
const key = "sb_publishable_2Q7aF-M61t2OZWRrt-vebQ_t_oNK_u7";

// Bump this marker whenever production data routing changes so Git/Vercel emits
// a fresh production build instead of leaving an older frontend bundle live.
export const CRM_DATASET_VERSION = "eurevector-890-2026-09-15";

export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});
