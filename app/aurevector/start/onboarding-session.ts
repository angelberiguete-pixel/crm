import { supabase } from "../../../lib/supabase";

export type OnboardingEventName =
  | "onboarding_started"
  | "business_completed"
  | "objectives_completed"
  | "proposal_viewed"
  | "sandbox_message"
  | "activation_clicked";

export type PersistedDraft = {
  business: Record<string, string>;
  objectives: string[];
  tone: string;
};

export async function ensureOnboardingSession(draft: PersistedDraft) {
  let { data: auth } = await supabase.auth.getSession();
  if (!auth.session) {
    const result = await supabase.auth.signInAnonymously();
    if (result.error) throw result.error;
    auth = { session: result.data.session };
  }
  const user = auth.session?.user;
  if (!user) throw new Error("No se pudo iniciar la sesión de onboarding.");

  const { data: existing, error: readError } = await supabase
    .from("onboarding_sessions")
    .select("id,current_step,business,objectives,tone,expires_at")
    .eq("user_id", user.id)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (readError) throw readError;
  if (existing) return { userId: user.id, session: existing };

  const { data: created, error: createError } = await supabase
    .from("onboarding_sessions")
    .insert({ user_id: user.id, business: draft.business, objectives: draft.objectives, tone: draft.tone })
    .select("id,current_step,business,objectives,tone,expires_at")
    .single();
  if (createError) throw createError;
  await trackOnboardingEvent(created.id, user.id, "onboarding_started");
  return { userId: user.id, session: created };
}

export async function saveOnboardingSession(sessionId: string, userId: string, draft: PersistedDraft, step: number, proposal?: unknown) {
  const { error } = await supabase.from("onboarding_sessions").update({
    business: draft.business,
    objectives: draft.objectives,
    tone: draft.tone,
    current_step: step,
    status: step === 3 ? "preview" : "draft",
    proposal: proposal ?? {},
    updated_at: new Date().toISOString(),
  }).eq("id", sessionId).eq("user_id", userId);
  if (error) throw error;
}

export async function trackOnboardingEvent(sessionId: string, userId: string, eventName: OnboardingEventName, properties: Record<string, unknown> = {}) {
  const { error } = await supabase.from("onboarding_events").insert({
    session_id: sessionId,
    user_id: userId,
    event_name: eventName,
    properties,
  });
  if (error) throw error;
}
