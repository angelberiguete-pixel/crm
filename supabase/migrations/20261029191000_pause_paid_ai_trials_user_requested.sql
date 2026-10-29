-- Explicit user instruction, 2026-10-29: do NOT use existing OpenAI API credits.
-- This reversible deployment-safe gate disables the only paid AI reservation RPC.
-- Already applied in Supabase as migration pause_paid_ai_trials_user_requested_no_credit_use.
-- Keep even if other pending AI migrations are later merged/deployed.
REVOKE EXECUTE ON FUNCTION public.reserve_ai_employee_budgeted_trial(
  uuid,uuid,uuid,text,text,bigint,bigint,bigint
) FROM service_role, authenticated, anon, PUBLIC;
