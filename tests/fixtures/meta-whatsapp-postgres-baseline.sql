-- QA-18 only. Disposable PostgreSQL fixture; NO production dump or customer records.
-- This is the minimum schema contract for the Meta verified router and task trigger.
-- It does NOT certify production-schema equivalence or end-user RLS.
CREATE ROLE service_role BYPASSRLS;
CREATE ROLE authenticated;
CREATE ROLE anon;

CREATE TABLE public.tenants(
 id uuid PRIMARY KEY, status text NOT NULL
);
CREATE TABLE public.channels(
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES public.tenants(id),
 provider text NOT NULL, status text NOT NULL, UNIQUE(tenant_id,id)
);
CREATE TABLE public.contacts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id),
 display_name text NOT NULL, phone text, whatsapp_phone text,
 source text, status text, metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.ai_agents(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id), status text NOT NULL
);
CREATE TABLE public.ai_agent_bindings(
 tenant_id uuid NOT NULL, channel_id uuid NOT NULL, agent_id uuid NOT NULL,
 is_enabled boolean NOT NULL DEFAULT false,
 trigger_mode text NOT NULL DEFAULT 'manual',
 priority integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.conversations(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id),
 channel_id uuid NOT NULL, contact_id uuid NOT NULL,
 external_thread_id text NOT NULL, status text NOT NULL, subject text,
 last_message_at timestamptz, metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 UNIQUE(tenant_id,channel_id,external_thread_id)
);
CREATE TABLE public.messages(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id),
 conversation_id uuid NOT NULL, direction text NOT NULL, sender_type text NOT NULL,
 sender_contact_id uuid, external_message_id text NOT NULL,
 message_type text NOT NULL, body text NOT NULL, status text NOT NULL,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 UNIQUE(tenant_id,conversation_id,external_message_id)
);
CREATE TABLE public.tasks(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id),
 contact_id uuid, title text NOT NULL, description text,
 status text NOT NULL, priority text NOT NULL, due_at timestamptz,
 source text NOT NULL, metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
