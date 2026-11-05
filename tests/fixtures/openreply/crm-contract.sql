-- Disposable PostgreSQL contract fixture. Column definitions, constraints and
-- quote calculations were inspected in the CRM; this is not its complete schema.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE SCHEMA private;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid; $$;
CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_app_meta_data jsonb,raw_user_meta_data jsonb);
GRANT USAGE ON SCHEMA public,auth,private TO anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon,authenticated,service_role;
CREATE TABLE public."tenants" (
 "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
 "name" text NOT NULL,
 "slug" text NOT NULL,
 "status" text DEFAULT 'active'::text NOT NULL,
 "owner_user_id" uuid NOT NULL,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL,
 "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."memberships" (
 "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
 "tenant_id" uuid NOT NULL,
 "user_id" uuid NOT NULL,
 "role" text DEFAULT 'agent'::text NOT NULL,
 "status" text DEFAULT 'active'::text NOT NULL,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL,
 "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."channels" (
 "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
 "tenant_id" uuid NOT NULL,
 "provider" text NOT NULL,
 "name" text NOT NULL,
 "status" text DEFAULT 'disconnected'::text NOT NULL,
 "external_account_id" text,
 "settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
 "created_by" uuid DEFAULT auth.uid(),
 "created_at" timestamp with time zone DEFAULT now() NOT NULL,
 "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."contacts" (
 "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
 "tenant_id" uuid NOT NULL,
 "company_id" uuid,
 "first_name" text,
 "last_name" text,
 "display_name" text NOT NULL,
 "email" text,
 "phone" text,
 "source" text,
 "status" text DEFAULT 'lead'::text NOT NULL,
 "owner_user_id" uuid,
 "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
 "created_by" uuid DEFAULT auth.uid(),
 "created_at" timestamp with time zone DEFAULT now() NOT NULL,
 "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
 "job_title" text,
 "whatsapp_phone" text
);
CREATE TABLE public."products" (
 "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
 "tenant_id" uuid NOT NULL,
 "sku" text NOT NULL,
 "name" text NOT NULL,
 "description" text,
 "status" text DEFAULT 'active'::text NOT NULL,
 "source_system" text DEFAULT 'crm'::text NOT NULL,
 "sale_price" numeric(14,2) DEFAULT 0 NOT NULL,
 "currency" text DEFAULT 'DOP'::text NOT NULL,
 "tax_rate" numeric(7,4) DEFAULT 0 NOT NULL,
 "stock_snapshot" numeric(14,3),
 "stock_synced_at" timestamp with time zone,
 "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
 "created_by" uuid DEFAULT auth.uid(),
 "created_at" timestamp with time zone DEFAULT now() NOT NULL,
 "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."conversations" (
 "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
 "tenant_id" uuid NOT NULL,
 "channel_id" uuid NOT NULL,
 "contact_id" uuid,
 "opportunity_id" uuid,
 "subject" text,
 "external_thread_id" text,
 "status" text DEFAULT 'open'::text NOT NULL,
 "priority" text DEFAULT 'normal'::text NOT NULL,
 "assigned_to" uuid,
 "last_message_at" timestamp with time zone,
 "unread_count" integer DEFAULT 0 NOT NULL,
 "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
 "created_by" uuid DEFAULT auth.uid(),
 "created_at" timestamp with time zone DEFAULT now() NOT NULL,
 "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."messages" (
 "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
 "tenant_id" uuid NOT NULL,
 "conversation_id" uuid NOT NULL,
 "direction" text NOT NULL,
 "sender_type" text NOT NULL,
 "sender_user_id" uuid,
 "sender_contact_id" uuid,
 "external_message_id" text,
 "message_type" text DEFAULT 'text'::text NOT NULL,
 "body" text,
 "status" text DEFAULT 'created'::text NOT NULL,
 "sent_at" timestamp with time zone,
 "delivered_at" timestamp with time zone,
 "read_at" timestamp with time zone,
 "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."quotations" (
 "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
 "tenant_id" uuid NOT NULL,
 "quote_number" text NOT NULL,
 "contact_id" uuid,
 "company_id" uuid,
 "opportunity_id" uuid,
 "status" text DEFAULT 'draft'::text NOT NULL,
 "currency" text DEFAULT 'DOP'::text NOT NULL,
 "valid_until" date,
 "notes" text,
 "terms" text,
 "subtotal" numeric(14,2) DEFAULT 0 NOT NULL,
 "discount_total" numeric(14,2) DEFAULT 0 NOT NULL,
 "tax_total" numeric(14,2) DEFAULT 0 NOT NULL,
 "total" numeric(14,2) DEFAULT 0 NOT NULL,
 "accepted_at" timestamp with time zone,
 "rejected_at" timestamp with time zone,
 "erp_order_status" text,
 "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
 "created_by" uuid DEFAULT auth.uid(),
 "created_at" timestamp with time zone DEFAULT now() NOT NULL,
 "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."quotation_items" (
 "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
 "tenant_id" uuid NOT NULL,
 "quotation_id" uuid NOT NULL,
 "product_id" uuid,
 "position" integer DEFAULT 0 NOT NULL,
 "sku_snapshot" text,
 "description" text NOT NULL,
 "quantity" numeric(14,3) DEFAULT 1 NOT NULL,
 "unit_price" numeric(14,2) DEFAULT 0 NOT NULL,
 "discount_percent" numeric(7,4) DEFAULT 0 NOT NULL,
 "tax_rate" numeric(7,4) DEFAULT 0 NOT NULL,
 "line_subtotal" numeric(14,2) GENERATED ALWAYS AS (round(((quantity * unit_price) * ((1)::numeric - (discount_percent / 100.0))), 2)) STORED,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL,
 "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."tasks" (
 "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
 "tenant_id" uuid NOT NULL,
 "title" text NOT NULL,
 "description" text,
 "status" text DEFAULT 'todo'::text NOT NULL,
 "priority" text DEFAULT 'normal'::text NOT NULL,
 "due_at" timestamp with time zone,
 "completed_at" timestamp with time zone,
 "assigned_user_id" uuid,
 "contact_id" uuid,
 "company_id" uuid,
 "opportunity_id" uuid,
 "parent_task_id" uuid,
 "source" text DEFAULT 'manual'::text NOT NULL,
 "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
 "created_by" uuid DEFAULT auth.uid(),
 "created_at" timestamp with time zone DEFAULT now() NOT NULL,
 "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public."channels" ADD UNIQUE (tenant_id, id);
ALTER TABLE public."channels" ADD UNIQUE (tenant_id, provider, external_account_id);
ALTER TABLE public."contacts" ADD UNIQUE (tenant_id, id);
ALTER TABLE public."conversations" ADD UNIQUE (tenant_id, channel_id, external_thread_id);
ALTER TABLE public."conversations" ADD UNIQUE (tenant_id, id);
ALTER TABLE public."memberships" ADD UNIQUE (tenant_id, user_id);
ALTER TABLE public."messages" ADD UNIQUE (tenant_id, conversation_id, external_message_id);
ALTER TABLE public."messages" ADD UNIQUE (tenant_id, id);
ALTER TABLE public."products" ADD UNIQUE (tenant_id, id);
ALTER TABLE public."products" ADD UNIQUE (tenant_id, sku);
ALTER TABLE public."quotation_items" ADD UNIQUE (quotation_id, "position");
ALTER TABLE public."quotations" ADD UNIQUE (tenant_id, id);
ALTER TABLE public."quotations" ADD UNIQUE (tenant_id, quote_number);
ALTER TABLE public."tasks" ADD UNIQUE (tenant_id, id);
ALTER TABLE public."tenants" ADD UNIQUE (slug);
ALTER TABLE public."channels" ADD FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."channels" ADD CHECK ((provider = ANY (ARRAY['whatsapp'::text, 'email'::text, 'sms'::text, 'webchat'::text, 'instagram'::text, 'messenger'::text, 'manual'::text])));
ALTER TABLE public."channels" ADD CHECK ((status = ANY (ARRAY['connected'::text, 'disconnected'::text, 'error'::text, 'paused'::text])));
ALTER TABLE public."channels" ADD FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."contacts" ADD FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."contacts" ADD FOREIGN KEY (owner_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."contacts" ADD CHECK ((status = ANY (ARRAY['lead'::text, 'prospect'::text, 'customer'::text, 'inactive'::text])));
ALTER TABLE public."contacts" ADD FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."conversations" ADD FOREIGN KEY (assigned_to) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."conversations" ADD FOREIGN KEY (tenant_id, assigned_to) REFERENCES memberships(tenant_id, user_id);
ALTER TABLE public."conversations" ADD FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."conversations" ADD CHECK ((priority = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text, 'urgent'::text])));
ALTER TABLE public."conversations" ADD CHECK ((status = ANY (ARRAY['open'::text, 'pending'::text, 'snoozed'::text, 'closed'::text])));
ALTER TABLE public."conversations" ADD FOREIGN KEY (tenant_id, channel_id) REFERENCES channels(tenant_id, id) ON DELETE CASCADE;
ALTER TABLE public."conversations" ADD FOREIGN KEY (tenant_id, contact_id) REFERENCES contacts(tenant_id, id) ON DELETE SET NULL;
ALTER TABLE public."conversations" ADD FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."conversations" ADD CHECK ((unread_count >= 0));
ALTER TABLE public."memberships" ADD CHECK ((role = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'agent'::text, 'viewer'::text])));
ALTER TABLE public."memberships" ADD CHECK ((status = ANY (ARRAY['active'::text, 'invited'::text, 'suspended'::text])));
ALTER TABLE public."memberships" ADD FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."memberships" ADD FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public."messages" ADD CHECK ((direction = ANY (ARRAY['inbound'::text, 'outbound'::text, 'internal'::text])));
ALTER TABLE public."messages" ADD CHECK ((message_type = ANY (ARRAY['text'::text, 'image'::text, 'audio'::text, 'video'::text, 'document'::text, 'location'::text, 'template'::text, 'event'::text, 'note'::text])));
ALTER TABLE public."messages" ADD CHECK ((sender_type = ANY (ARRAY['contact'::text, 'user'::text, 'system'::text, 'ai'::text, 'external'::text])));
ALTER TABLE public."messages" ADD FOREIGN KEY (sender_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."messages" ADD CHECK ((status = ANY (ARRAY['created'::text, 'queued'::text, 'sent'::text, 'delivered'::text, 'read'::text, 'failed'::text, 'received'::text])));
ALTER TABLE public."messages" ADD FOREIGN KEY (tenant_id, conversation_id) REFERENCES conversations(tenant_id, id) ON DELETE CASCADE;
ALTER TABLE public."messages" ADD FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."messages" ADD FOREIGN KEY (tenant_id, sender_contact_id) REFERENCES contacts(tenant_id, id) ON DELETE SET NULL;
ALTER TABLE public."products" ADD FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."products" ADD CHECK ((sale_price >= (0)::numeric));
ALTER TABLE public."products" ADD CHECK ((source_system = ANY (ARRAY['crm'::text, 'odoo'::text])));
ALTER TABLE public."products" ADD CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text, 'archived'::text])));
ALTER TABLE public."products" ADD CHECK (((tax_rate >= (0)::numeric) AND (tax_rate <= (100)::numeric)));
ALTER TABLE public."products" ADD FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."quotation_items" ADD CHECK (((discount_percent >= (0)::numeric) AND (discount_percent <= (100)::numeric)));
ALTER TABLE public."quotation_items" ADD FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id) ON DELETE SET NULL;
ALTER TABLE public."quotation_items" ADD CHECK ((quantity > (0)::numeric));
ALTER TABLE public."quotation_items" ADD FOREIGN KEY (tenant_id, quotation_id) REFERENCES quotations(tenant_id, id) ON DELETE CASCADE;
ALTER TABLE public."quotation_items" ADD CHECK (((tax_rate >= (0)::numeric) AND (tax_rate <= (100)::numeric)));
ALTER TABLE public."quotation_items" ADD FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."quotation_items" ADD CHECK ((unit_price >= (0)::numeric));
ALTER TABLE public."quotations" ADD FOREIGN KEY (tenant_id, contact_id) REFERENCES contacts(tenant_id, id) ON DELETE SET NULL;
ALTER TABLE public."quotations" ADD FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."quotations" ADD CHECK ((discount_total >= (0)::numeric));
ALTER TABLE public."quotations" ADD CHECK ((status = ANY (ARRAY['draft'::text, 'sent'::text, 'accepted'::text, 'rejected'::text, 'expired'::text, 'cancelled'::text])));
ALTER TABLE public."quotations" ADD CHECK ((subtotal >= (0)::numeric));
ALTER TABLE public."quotations" ADD CHECK ((tax_total >= (0)::numeric));
ALTER TABLE public."quotations" ADD FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."quotations" ADD CHECK ((total >= (0)::numeric));
ALTER TABLE public."tasks" ADD FOREIGN KEY (tenant_id, assigned_user_id) REFERENCES memberships(tenant_id, user_id) ON DELETE SET NULL;
ALTER TABLE public."tasks" ADD CHECK ((((status = 'done'::text) AND (completed_at IS NOT NULL)) OR (status <> 'done'::text)));
ALTER TABLE public."tasks" ADD FOREIGN KEY (tenant_id, contact_id) REFERENCES contacts(tenant_id, id) ON DELETE SET NULL;
ALTER TABLE public."tasks" ADD FOREIGN KEY (tenant_id, parent_task_id) REFERENCES tasks(tenant_id, id) ON DELETE CASCADE;
ALTER TABLE public."tasks" ADD CHECK ((priority = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text, 'urgent'::text])));
ALTER TABLE public."tasks" ADD CHECK ((source = ANY (ARRAY['manual'::text, 'automation'::text, 'ai'::text, 'import'::text, 'erp'::text])));
ALTER TABLE public."tasks" ADD CHECK ((status = ANY (ARRAY['todo'::text, 'in_progress'::text, 'done'::text, 'cancelled'::text])));
ALTER TABLE public."tasks" ADD FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."tenants" ADD FOREIGN KEY (owner_user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;
ALTER TABLE public."tenants" ADD CHECK ((slug ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$'::text));
ALTER TABLE public."tenants" ADD CHECK ((status = ANY (ARRAY['active'::text, 'trial'::text, 'suspended'::text, 'cancelled'::text])));

CREATE TABLE public.plans(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),code text UNIQUE);
INSERT INTO public.plans(code) VALUES('enterprise');
CREATE TABLE public.tenant_subscriptions(tenant_id uuid,plan_id uuid,status text);
CREATE FUNCTION private.is_tenant_admin(p_tenant_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.memberships m JOIN public.tenants t ON t.id=m.tenant_id WHERE m.tenant_id=p_tenant_id AND m.user_id=auth.uid() AND m.role IN ('owner','admin') AND m.status='active' AND t.status='active');
$$;
CREATE FUNCTION private.qa_is_member(p_tenant_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.memberships m WHERE m.tenant_id=p_tenant_id AND m.user_id=auth.uid() AND m.status='active');
$$;
CREATE FUNCTION public.set_active_tenant(p_tenant_id uuid) RETURNS void LANGUAGE plpgsql AS $$
 BEGIN IF NOT private.qa_is_member(p_tenant_id) THEN RAISE EXCEPTION 'denied' USING errcode='42501'; END IF; PERFORM set_config('qa.active_tenant',p_tenant_id::text,true); END;
$$;
ALTER TABLE public."tenants" ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."tenants" TO authenticated,service_role;
ALTER TABLE public."memberships" ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."memberships" TO authenticated,service_role;
CREATE POLICY qa_members ON public."memberships" TO authenticated USING(private.qa_is_member(tenant_id)) WITH CHECK(private.qa_is_member(tenant_id));
ALTER TABLE public."channels" ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."channels" TO authenticated,service_role;
CREATE POLICY qa_members ON public."channels" TO authenticated USING(private.qa_is_member(tenant_id)) WITH CHECK(private.qa_is_member(tenant_id));
ALTER TABLE public."contacts" ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."contacts" TO authenticated,service_role;
CREATE POLICY qa_members ON public."contacts" TO authenticated USING(private.qa_is_member(tenant_id)) WITH CHECK(private.qa_is_member(tenant_id));
ALTER TABLE public."products" ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."products" TO authenticated,service_role;
CREATE POLICY qa_members ON public."products" TO authenticated USING(private.qa_is_member(tenant_id)) WITH CHECK(private.qa_is_member(tenant_id));
ALTER TABLE public."conversations" ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."conversations" TO authenticated,service_role;
CREATE POLICY qa_members ON public."conversations" TO authenticated USING(private.qa_is_member(tenant_id)) WITH CHECK(private.qa_is_member(tenant_id));
ALTER TABLE public."messages" ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."messages" TO authenticated,service_role;
CREATE POLICY qa_members ON public."messages" TO authenticated USING(private.qa_is_member(tenant_id)) WITH CHECK(private.qa_is_member(tenant_id));
ALTER TABLE public."quotations" ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."quotations" TO authenticated,service_role;
CREATE POLICY qa_members ON public."quotations" TO authenticated USING(private.qa_is_member(tenant_id)) WITH CHECK(private.qa_is_member(tenant_id));
ALTER TABLE public."quotation_items" ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."quotation_items" TO authenticated,service_role;
CREATE POLICY qa_members ON public."quotation_items" TO authenticated USING(private.qa_is_member(tenant_id)) WITH CHECK(private.qa_is_member(tenant_id));
ALTER TABLE public."tasks" ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON public."tasks" TO authenticated,service_role;
CREATE POLICY qa_members ON public."tasks" TO authenticated USING(private.qa_is_member(tenant_id)) WITH CHECK(private.qa_is_member(tenant_id));
CREATE OR REPLACE FUNCTION private.recalculate_quotation_totals(p_tenant_id uuid, p_quotation_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'private'
AS $function$
declare
  v_subtotal numeric(14,2);
  v_discount numeric(14,2);
  v_tax numeric(14,2);
begin
  select
    coalesce(round(sum(qi.quantity * qi.unit_price)::numeric, 2), 0),
    coalesce(round(sum((qi.quantity * qi.unit_price) * (qi.discount_percent / 100.0))::numeric, 2), 0),
    coalesce(round(sum((qi.quantity * qi.unit_price * (1 - qi.discount_percent / 100.0)) * (qi.tax_rate / 100.0))::numeric, 2), 0)
  into v_subtotal, v_discount, v_tax
  from public.quotation_items qi
  where qi.tenant_id = p_tenant_id and qi.quotation_id = p_quotation_id;

  update public.quotations q
  set subtotal = v_subtotal,
      discount_total = v_discount,
      tax_total = v_tax,
      total = greatest(0, v_subtotal - v_discount + v_tax),
      updated_at = now()
  where q.tenant_id = p_tenant_id and q.id = p_quotation_id;
end;
$function$

CREATE OR REPLACE FUNCTION private.quotation_items_recalc_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'private'
AS $function$
begin
  if tg_op in ('UPDATE','DELETE') then
    perform private.recalculate_quotation_totals(old.tenant_id, old.quotation_id);
  end if;
  if tg_op in ('INSERT','UPDATE') then
    perform private.recalculate_quotation_totals(new.tenant_id, new.quotation_id);
  end if;
  return coalesce(new, old);
end;
$function$

CREATE TRIGGER quotation_items_recalculate AFTER INSERT OR UPDATE OR DELETE ON public.quotation_items FOR EACH ROW EXECUTE FUNCTION private.quotation_items_recalc_trigger();
