-- Schema change already applied to Supabase migration 20261010194843.
ALTER TABLE public.lead_capture_submissions ADD CONSTRAINT lead_capture_submissions_consent_required CHECK (consent IS TRUE);
