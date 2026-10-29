-- Server-only idempotency record for explicit, single-recipient WhatsApp test sends.
-- Apply ONLY after the Meta Business portfolio and outbound phone number are verified.
-- The user cannot read or insert attempts through the browser Data API.
CREATE TABLE IF NOT EXISTS public.whatsapp_send_attempts (
  request_id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_phone_number_id text NOT NULL,
  recipient_e164 text NOT NULL,
  body_sha256 text NOT NULL CHECK (body_sha256 ~ '^[a-f0-9]{64}$'),
  status text NOT NULL CHECK (status IN ('pending','accepted','failed','uncertain')),
  provider_message_id text,
  failure_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.whatsapp_send_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.whatsapp_send_attempts FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.whatsapp_send_attempts TO service_role;
CREATE INDEX IF NOT EXISTS whatsapp_send_attempts_tenant_recent
 ON public.whatsapp_send_attempts(tenant_id, created_at DESC);
COMMENT ON TABLE public.whatsapp_send_attempts IS
 'Private outbound WhatsApp attempt ledger. Only the authorized service worker can insert; accepted is not delivered.';
