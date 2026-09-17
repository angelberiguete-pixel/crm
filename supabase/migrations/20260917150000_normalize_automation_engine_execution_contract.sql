alter table public.automation_rules drop constraint if exists automation_rules_trigger_type_check;
alter table public.automation_rules add constraint automation_rules_trigger_type_check check (trigger_type = any (array['event','manual','schedule','webhook']::text[]));
alter table public.automation_rules drop constraint if exists automation_event_requires_name;
alter table public.automation_rules add constraint automation_event_requires_name check (trigger_type <> 'event' or trigger_event = any (array['lead_created','contact_created','opportunity_created','stage_changed','message_received','message_not_answered','task_overdue','meeting_scheduled','quotation_created','quotation_accepted','payment_received','deal_stale']::text[]));

alter table public.automation_actions drop constraint if exists automation_actions_action_type_check;
alter table public.automation_actions add constraint automation_actions_action_type_check check (action_type = any (array['condition','branch','delay','assign_owner','create_task','send_whatsapp','send_email','update_contact','update_opportunity','move_stage','add_tag','create_notification','call_webhook','request_approval','invoke_ai']::text[]));
alter table public.automation_actions add column if not exists retry_policy jsonb not null default '{"max_attempts":3,"backoff_seconds":60}'::jsonb;
alter table public.automation_actions add column if not exists requires_approval boolean not null default false;
alter table public.automation_actions add constraint automation_actions_retry_policy_object check (jsonb_typeof(retry_policy)='object');

alter table public.automation_runs add column if not exists retry_count integer not null default 0;
alter table public.automation_runs add column if not exists next_retry_at timestamptz;
alter table public.automation_runs add column if not exists duration_ms bigint;
alter table public.automation_runs add constraint automation_runs_retry_count_nonnegative check (retry_count >= 0);
create unique index if not exists automation_runs_tenant_idempotency_uidx on public.automation_runs(tenant_id,idempotency_key) where idempotency_key is not null;

alter table public.automation_action_runs drop constraint if exists automation_action_runs_status_check;
alter table public.automation_action_runs add constraint automation_action_runs_status_check check (status = any (array['queued','running','waiting_approval','retry_scheduled','succeeded','failed','skipped']::text[]));
alter table public.automation_action_runs add column if not exists next_retry_at timestamptz;
alter table public.automation_action_runs add column if not exists duration_ms bigint;
alter table public.automation_action_runs add column if not exists approval_requested_at timestamptz;
alter table public.automation_action_runs add column if not exists approved_at timestamptz;
alter table public.automation_action_runs add column if not exists approved_by uuid references auth.users(id) on delete set null;

comment on column public.automation_actions.retry_policy is 'Per-step retry contract, e.g. max_attempts and backoff_seconds.';
comment on column public.automation_actions.requires_approval is 'When true the executor must pause before external/sensitive action until approved.';
