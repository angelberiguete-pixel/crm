alter table public.automation_rules drop constraint if exists automation_rules_status_check;
alter table public.automation_rules add constraint automation_rules_status_check
check (status = any (array['draft','testing','active','paused','archived']::text[]));

alter table public.automation_rules drop constraint if exists automation_event_requires_name;
alter table public.automation_rules add constraint automation_event_requires_name
check (
  trigger_type <> 'event'
  or trigger_event = any (array[
    'lead_created','contact_created','form_received','message_received',
    'opportunity_created','stage_changed','quotation_created','quotation_sent',
    'quotation_accepted','quotation_expired','order_created','payment_received',
    'payment_due','appointment_created','appointment_upcoming','appointment_missed',
    'inventory_low','odoo_changed','task_overdue','message_not_answered',
    'meeting_scheduled','deal_stale','custom_event'
  ]::text[])
);

alter table public.automation_actions drop constraint if exists automation_actions_action_type_check;
alter table public.automation_actions add constraint automation_actions_action_type_check
check (action_type = any (array[
  'condition','branch','delay','assign_owner','create_task','send_whatsapp',
  'send_email','update_contact','update_opportunity','move_stage','add_tag',
  'create_notification','call_webhook','request_approval','invoke_ai',
  'sync_odoo','create_quotation','create_order','generate_document'
]::text[]));

create table if not exists public.automation_flow_nodes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  rule_id uuid not null,
  node_key text not null,
  node_type text not null check (node_type = any (array['trigger','action','condition','delay','approval','ai']::text[])),
  action_type text,
  label text not null,
  position_x integer not null default 80,
  position_y integer not null default 80,
  config jsonb not null default '{}'::jsonb check (jsonb_typeof(config)='object'),
  is_enabled boolean not null default true,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, rule_id, id),
  unique (rule_id, node_key),
  constraint automation_flow_nodes_rule_tenant_fk
    foreign key (tenant_id, rule_id)
    references public.automation_rules(tenant_id, id)
    on delete cascade
);

create table if not exists public.automation_flow_edges (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  rule_id uuid not null,
  source_node_id uuid not null,
  target_node_id uuid not null,
  source_handle text not null default 'default',
  label text,
  condition_config jsonb not null default '{}'::jsonb check (jsonb_typeof(condition_config)='object'),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  check (source_node_id <> target_node_id),
  unique (rule_id, source_node_id, target_node_id, source_handle),
  constraint automation_flow_edges_rule_tenant_fk
    foreign key (tenant_id, rule_id)
    references public.automation_rules(tenant_id, id)
    on delete cascade,
  constraint automation_flow_edges_source_fk
    foreign key (tenant_id, rule_id, source_node_id)
    references public.automation_flow_nodes(tenant_id, rule_id, id)
    on delete cascade,
  constraint automation_flow_edges_target_fk
    foreign key (tenant_id, rule_id, target_node_id)
    references public.automation_flow_nodes(tenant_id, rule_id, id)
    on delete cascade
);

create table if not exists public.automation_flow_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  rule_id uuid not null,
  version_number integer not null check (version_number > 0),
  state text not null default 'draft' check (state = any (array['draft','published','archived']::text[])),
  snapshot jsonb not null check (jsonb_typeof(snapshot)='object'),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  published_at timestamptz,
  unique (rule_id, version_number),
  constraint automation_flow_versions_rule_tenant_fk
    foreign key (tenant_id, rule_id)
    references public.automation_rules(tenant_id, id)
    on delete cascade
);

create index if not exists automation_flow_nodes_rule_idx
  on public.automation_flow_nodes(tenant_id, rule_id);
create index if not exists automation_flow_edges_rule_idx
  on public.automation_flow_edges(tenant_id, rule_id);
create index if not exists automation_flow_versions_rule_idx
  on public.automation_flow_versions(tenant_id, rule_id, version_number desc);

alter table public.automation_flow_nodes enable row level security;
alter table public.automation_flow_edges enable row level security;
alter table public.automation_flow_versions enable row level security;

drop policy if exists automation_flow_nodes_select on public.automation_flow_nodes;
create policy automation_flow_nodes_select on public.automation_flow_nodes
for select to authenticated using (private.has_tenant_access(tenant_id));

drop policy if exists automation_flow_nodes_insert on public.automation_flow_nodes;
create policy automation_flow_nodes_insert on public.automation_flow_nodes
for insert to authenticated with check (private.is_tenant_admin(tenant_id) or private.crm_is_platform_admin());

drop policy if exists automation_flow_nodes_update on public.automation_flow_nodes;
create policy automation_flow_nodes_update on public.automation_flow_nodes
for update to authenticated
using (private.is_tenant_admin(tenant_id) or private.crm_is_platform_admin())
with check (private.is_tenant_admin(tenant_id) or private.crm_is_platform_admin());

drop policy if exists automation_flow_nodes_delete on public.automation_flow_nodes;
create policy automation_flow_nodes_delete on public.automation_flow_nodes
for delete to authenticated using (private.is_tenant_admin(tenant_id) or private.crm_is_platform_admin());

drop policy if exists automation_flow_edges_select on public.automation_flow_edges;
create policy automation_flow_edges_select on public.automation_flow_edges
for select to authenticated using (private.has_tenant_access(tenant_id));

drop policy if exists automation_flow_edges_insert on public.automation_flow_edges;
create policy automation_flow_edges_insert on public.automation_flow_edges
for insert to authenticated with check (private.is_tenant_admin(tenant_id) or private.crm_is_platform_admin());

drop policy if exists automation_flow_edges_update on public.automation_flow_edges;
create policy automation_flow_edges_update on public.automation_flow_edges
for update to authenticated
using (private.is_tenant_admin(tenant_id) or private.crm_is_platform_admin())
with check (private.is_tenant_admin(tenant_id) or private.crm_is_platform_admin());

drop policy if exists automation_flow_edges_delete on public.automation_flow_edges;
create policy automation_flow_edges_delete on public.automation_flow_edges
for delete to authenticated using (private.is_tenant_admin(tenant_id) or private.crm_is_platform_admin());

drop policy if exists automation_flow_versions_select on public.automation_flow_versions;
create policy automation_flow_versions_select on public.automation_flow_versions
for select to authenticated using (private.has_tenant_access(tenant_id));

drop policy if exists automation_flow_versions_insert on public.automation_flow_versions;
create policy automation_flow_versions_insert on public.automation_flow_versions
for insert to authenticated with check (private.is_tenant_admin(tenant_id) or private.crm_is_platform_admin());

create or replace function private.prevent_automation_flow_cycle()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.source_node_id = new.target_node_id then
    raise exception 'Automation flow cannot connect a node to itself';
  end if;

  if exists (
    with recursive reachable(node_id) as (
      select e.target_node_id
      from public.automation_flow_edges e
      where e.tenant_id = new.tenant_id
        and e.rule_id = new.rule_id
        and e.source_node_id = new.target_node_id
        and e.id <> new.id
      union
      select e.target_node_id
      from public.automation_flow_edges e
      join reachable r on e.source_node_id = r.node_id
      where e.tenant_id = new.tenant_id
        and e.rule_id = new.rule_id
        and e.id <> new.id
    )
    select 1 from reachable where node_id = new.source_node_id limit 1
  ) then
    raise exception 'Automation flow cycle detected';
  end if;

  return new;
end;
$$;

drop trigger if exists automation_flow_edges_prevent_cycle on public.automation_flow_edges;
create trigger automation_flow_edges_prevent_cycle
before insert or update of source_node_id,target_node_id
on public.automation_flow_edges
for each row execute function private.prevent_automation_flow_cycle();

create or replace function public.save_automation_flow_version(p_rule_id uuid, p_publish boolean default false)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid := auth.uid();
  v_tenant uuid;
  v_version integer;
  v_node_count integer;
  v_trigger_count integer;
  v_reachable_count integer;
  v_snapshot jsonb;
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  select r.tenant_id into v_tenant
  from public.automation_rules r
  where r.id=p_rule_id;

  if v_tenant is null then raise exception 'Automation not found'; end if;
  if not (private.is_tenant_admin(v_tenant) or private.crm_is_platform_admin()) then
    raise exception 'Tenant admin required';
  end if;

  select count(*), count(*) filter (where node_type='trigger')
  into v_node_count, v_trigger_count
  from public.automation_flow_nodes
  where tenant_id=v_tenant and rule_id=p_rule_id and is_enabled;

  if v_node_count < 2 then raise exception 'Automation requires at least a trigger and one step'; end if;
  if v_trigger_count <> 1 then raise exception 'Automation requires exactly one enabled trigger'; end if;

  with recursive reachable(id) as (
    select id from public.automation_flow_nodes
    where tenant_id=v_tenant and rule_id=p_rule_id and node_type='trigger' and is_enabled
    union
    select e.target_node_id
    from public.automation_flow_edges e
    join reachable r on e.source_node_id=r.id
    join public.automation_flow_nodes n on n.id=e.target_node_id and n.tenant_id=e.tenant_id and n.rule_id=e.rule_id
    where e.tenant_id=v_tenant and e.rule_id=p_rule_id and n.is_enabled
  )
  select count(distinct id) into v_reachable_count from reachable;

  if v_reachable_count <> v_node_count then
    raise exception 'All enabled nodes must be connected to the trigger';
  end if;

  select coalesce(max(version_number),0)+1 into v_version
  from public.automation_flow_versions
  where tenant_id=v_tenant and rule_id=p_rule_id;

  select jsonb_build_object(
    'rule', jsonb_build_object(
      'id',r.id,'name',r.name,'trigger_type',r.trigger_type,'trigger_event',r.trigger_event,
      'trigger_config',r.trigger_config,'conditions',r.conditions,'status',r.status
    ),
    'nodes', coalesce((
      select jsonb_agg(to_jsonb(n) order by n.created_at)
      from public.automation_flow_nodes n
      where n.tenant_id=v_tenant and n.rule_id=p_rule_id
    ),'[]'::jsonb),
    'edges', coalesce((
      select jsonb_agg(to_jsonb(e) order by e.created_at)
      from public.automation_flow_edges e
      where e.tenant_id=v_tenant and e.rule_id=p_rule_id
    ),'[]'::jsonb)
  )
  into v_snapshot
  from public.automation_rules r
  where r.id=p_rule_id;

  if p_publish then
    update public.automation_flow_versions
    set state='archived'
    where tenant_id=v_tenant and rule_id=p_rule_id and state='published';

    update public.automation_rules
    set status='testing', updated_at=now()
    where id=p_rule_id and tenant_id=v_tenant;
  end if;

  insert into public.automation_flow_versions(
    tenant_id,rule_id,version_number,state,snapshot,created_by,published_at
  ) values (
    v_tenant,p_rule_id,v_version,
    case when p_publish then 'published' else 'draft' end,
    v_snapshot,v_user,case when p_publish then now() else null end
  );

  insert into public.audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,metadata)
  values (
    v_tenant,v_user,
    case when p_publish then 'automation.flow_version_published' else 'automation.flow_version_saved' end,
    'automation_rule',p_rule_id,
    jsonb_build_object('version',v_version,'node_count',v_node_count,'execution_status',case when p_publish then 'testing' else 'draft' end)
  );

  return jsonb_build_object(
    'rule_id',p_rule_id,
    'version',v_version,
    'state',case when p_publish then 'published' else 'draft' end,
    'rule_status',case when p_publish then 'testing' else 'draft' end,
    'node_count',v_node_count
  );
end;
$$;

revoke all on function public.save_automation_flow_version(uuid,boolean) from public, anon;
grant execute on function public.save_automation_flow_version(uuid,boolean) to authenticated;

comment on table public.automation_flow_nodes is 'Tenant-scoped visual automation nodes used by the Look Social Media drag-and-drop automation studio.';
comment on table public.automation_flow_edges is 'Directed visual automation edges. A trigger prevents cycles so published flows are DAGs.';
comment on function public.save_automation_flow_version(uuid,boolean) is 'Validates a visual automation graph and stores an immutable version. Publish moves the rule to testing; activation requires a verified execution engine.';
