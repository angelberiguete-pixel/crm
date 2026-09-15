-- Eurevector CRM platform foundation
-- Extends the existing multi-tenant CRM. Does not replace existing tenants, memberships, plans or subscriptions.

create schema if not exists private;

-- -----------------------------------------------------------------------------
-- Platform administrators (Eurevector control plane)
-- -----------------------------------------------------------------------------
create table if not exists public.platform_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  platform_role text not null default 'platform_admin'
    check (platform_role in ('platform_owner','platform_admin','support')),
  status text not null default 'active'
    check (status in ('active','suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function private.crm_is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.platform_users pu
    where pu.user_id = auth.uid()
      and pu.status = 'active'
      and pu.platform_role in ('platform_owner','platform_admin')
  );
$$;

create or replace function private.crm_is_platform_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.platform_users pu
    where pu.user_id = auth.uid()
      and pu.status = 'active'
  );
$$;

create or replace function private.crm_is_tenant_member(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.crm_is_platform_admin()
    or exists (
      select 1 from public.memberships m
      where m.tenant_id = p_tenant_id
        and m.user_id = auth.uid()
        and m.status = 'active'
    );
$$;

create or replace function private.crm_is_tenant_admin(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.crm_is_platform_admin()
    or exists (
      select 1 from public.memberships m
      where m.tenant_id = p_tenant_id
        and m.user_id = auth.uid()
        and m.status = 'active'
        and m.role in ('owner','admin')
    );
$$;

revoke all on function private.crm_is_platform_admin() from public, anon, authenticated;
revoke all on function private.crm_is_platform_user() from public, anon, authenticated;
revoke all on function private.crm_is_tenant_member(uuid) from public, anon, authenticated;
revoke all on function private.crm_is_tenant_admin(uuid) from public, anon, authenticated;

alter table public.platform_users enable row level security;
drop policy if exists platform_users_select on public.platform_users;
create policy platform_users_select on public.platform_users
for select to authenticated
using (user_id = auth.uid() or private.crm_is_platform_admin());
drop policy if exists platform_users_manage on public.platform_users;
create policy platform_users_manage on public.platform_users
for all to authenticated
using (private.crm_is_platform_admin())
with check (private.crm_is_platform_admin());

-- One-time owner bootstrap. The code is generated inside the private schema and is
-- never stored in source code or exposed through PostgREST.
create table if not exists private.platform_bootstrap (
  singleton boolean primary key default true check (singleton),
  bootstrap_code text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

insert into private.platform_bootstrap(singleton, bootstrap_code, expires_at)
select true,
       upper(substr(md5(random()::text || clock_timestamp()::text || gen_random_uuid()::text), 1, 16)),
       now() + interval '14 days'
where not exists (select 1 from public.platform_users)
on conflict (singleton) do nothing;

create or replace function public.claim_platform_owner(p_bootstrap_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_bootstrap private.platform_bootstrap%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if exists (select 1 from public.platform_users) then
    raise exception 'Platform owner is already configured';
  end if;

  select * into v_bootstrap
  from private.platform_bootstrap
  where singleton = true
  for update;

  if v_bootstrap.used_at is not null then
    raise exception 'Bootstrap code already used';
  end if;
  if v_bootstrap.expires_at < now() then
    raise exception 'Bootstrap code expired';
  end if;
  if upper(trim(p_bootstrap_code)) <> v_bootstrap.bootstrap_code then
    raise exception 'Invalid bootstrap code';
  end if;

  insert into public.platform_users(user_id, platform_role, status)
  values (v_user_id, 'platform_owner', 'active');

  update private.platform_bootstrap set used_at = now() where singleton = true;

  return jsonb_build_object('user_id', v_user_id, 'platform_role', 'platform_owner');
end;
$$;
revoke all on function public.claim_platform_owner(text) from public, anon;
grant execute on function public.claim_platform_owner(text) to authenticated;

create or replace function public.platform_current_access()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'is_platform_admin', private.crm_is_platform_admin(),
    'is_platform_user', private.crm_is_platform_user(),
    'role', (select pu.platform_role from public.platform_users pu where pu.user_id = auth.uid() and pu.status='active' limit 1)
  );
$$;
revoke all on function public.platform_current_access() from public, anon;
grant execute on function public.platform_current_access() to authenticated;

-- -----------------------------------------------------------------------------
-- Module registry + plan/tenant feature controls
-- -----------------------------------------------------------------------------
create table if not exists public.platform_modules (
  module_key text primary key,
  name text not null,
  category text not null default 'core',
  description text,
  default_enabled boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.platform_modules(module_key,name,category,description,default_enabled) values
  ('dashboard','Dashboard','core','KPIs, actividad y resumen operativo',true),
  ('companies','Empresas','core','Cuentas y organizaciones comerciales',true),
  ('contacts','Contactos','core','Personas, propietarios y seguimiento',true),
  ('pipeline','Pipeline','sales','Oportunidades y etapas configurables',true),
  ('inbox','Inbox','channels','Conversaciones omnicanal',true),
  ('products','Productos','sales','Catálogo de productos y servicios',true),
  ('quotations','Cotizaciones','sales','Propuestas y cotizaciones',true),
  ('calendar','Calendario','operations','Citas, reuniones y seguimientos',true),
  ('automations','Automatizaciones','automation','Trigger, condiciones y acciones',false),
  ('ai_agents','IA / Agentes','ai','Agentes y copilotos por tenant',false),
  ('reports','Reportes','analytics','Conversión, ventas y actividad',true),
  ('settings','Configuración','core','Workspace, usuarios, roles e integraciones',true),
  ('white_label','White-label','enterprise','Marca, dominio y experiencia personalizada',false),
  ('client_portal','Client Portal','premium','Portal de resultados y operación para clientes',false),
  ('developer_api','Developer API','enterprise','API y webhooks externos',false)
on conflict (module_key) do update
set name=excluded.name,
    category=excluded.category,
    description=excluded.description,
    updated_at=now();

create table if not exists public.plan_module_entitlements (
  plan_id uuid not null references public.plans(id) on delete cascade,
  module_key text not null references public.platform_modules(module_key) on delete cascade,
  enabled boolean not null default true,
  limits jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(plan_id,module_key)
);

create table if not exists public.tenant_module_overrides (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  module_key text not null references public.platform_modules(module_key) on delete cascade,
  enabled boolean not null,
  config jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(tenant_id,module_key)
);

alter table public.platform_modules enable row level security;
alter table public.plan_module_entitlements enable row level security;
alter table public.tenant_module_overrides enable row level security;

drop policy if exists platform_modules_read on public.platform_modules;
create policy platform_modules_read on public.platform_modules for select to authenticated using (true);
drop policy if exists platform_modules_manage on public.platform_modules;
create policy platform_modules_manage on public.platform_modules for all to authenticated
using (private.crm_is_platform_admin()) with check (private.crm_is_platform_admin());

drop policy if exists plan_module_entitlements_read on public.plan_module_entitlements;
create policy plan_module_entitlements_read on public.plan_module_entitlements for select to authenticated using (true);
drop policy if exists plan_module_entitlements_manage on public.plan_module_entitlements;
create policy plan_module_entitlements_manage on public.plan_module_entitlements for all to authenticated
using (private.crm_is_platform_admin()) with check (private.crm_is_platform_admin());

drop policy if exists tenant_module_overrides_read on public.tenant_module_overrides;
create policy tenant_module_overrides_read on public.tenant_module_overrides for select to authenticated
using (private.crm_is_tenant_member(tenant_id));
drop policy if exists tenant_module_overrides_manage on public.tenant_module_overrides;
create policy tenant_module_overrides_manage on public.tenant_module_overrides for all to authenticated
using (private.crm_is_tenant_admin(tenant_id)) with check (private.crm_is_tenant_admin(tenant_id));

create or replace function public.tenant_effective_modules(p_tenant_id uuid)
returns table(module_key text, module_name text, enabled boolean, source text, config jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  with current_plan as (
    select ts.plan_id
    from public.tenant_subscriptions ts
    where ts.tenant_id = p_tenant_id
      and ts.status in ('active','trialing','past_due')
    limit 1
  )
  select pm.module_key,
         pm.name,
         coalesce(tmo.enabled, pme.enabled, pm.default_enabled) as enabled,
         case when tmo.module_key is not null then 'tenant_override'
              when pme.module_key is not null then 'plan'
              else 'default' end as source,
         coalesce(tmo.config, '{}'::jsonb) as config
  from public.platform_modules pm
  left join current_plan cp on true
  left join public.plan_module_entitlements pme
    on pme.plan_id = cp.plan_id and pme.module_key = pm.module_key
  left join public.tenant_module_overrides tmo
    on tmo.tenant_id = p_tenant_id and tmo.module_key = pm.module_key
  where pm.is_active = true
    and private.crm_is_tenant_member(p_tenant_id)
  order by pm.category, pm.name;
$$;
revoke all on function public.tenant_effective_modules(uuid) from public, anon;
grant execute on function public.tenant_effective_modules(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Tenant roles and granular permission profiles
-- -----------------------------------------------------------------------------
create table if not exists public.tenant_roles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  role_key text not null,
  name text not null,
  description text,
  permissions jsonb not null default '{}'::jsonb,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id, role_key)
);

create table if not exists public.tenant_role_bindings (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role_id uuid not null references public.tenant_roles(id) on delete cascade,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(tenant_id,user_id)
);

alter table public.tenant_roles enable row level security;
alter table public.tenant_role_bindings enable row level security;

drop policy if exists tenant_roles_read on public.tenant_roles;
create policy tenant_roles_read on public.tenant_roles for select to authenticated
using (private.crm_is_tenant_member(tenant_id));
drop policy if exists tenant_roles_manage on public.tenant_roles;
create policy tenant_roles_manage on public.tenant_roles for all to authenticated
using (private.crm_is_tenant_admin(tenant_id)) with check (private.crm_is_tenant_admin(tenant_id));

drop policy if exists tenant_role_bindings_read on public.tenant_role_bindings;
create policy tenant_role_bindings_read on public.tenant_role_bindings for select to authenticated
using (private.crm_is_tenant_member(tenant_id));
drop policy if exists tenant_role_bindings_manage on public.tenant_role_bindings;
create policy tenant_role_bindings_manage on public.tenant_role_bindings for all to authenticated
using (private.crm_is_tenant_admin(tenant_id)) with check (private.crm_is_tenant_admin(tenant_id));

create or replace function private.seed_default_tenant_roles(p_tenant_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.tenant_roles(tenant_id,role_key,name,description,permissions,is_system) values
    (p_tenant_id,'owner','Dueño','Control total del workspace','{"all":true}'::jsonb,true),
    (p_tenant_id,'admin','Administrador','Administra equipo, configuración y operación','{"dashboard":true,"companies":true,"contacts":true,"pipeline":true,"inbox":true,"products":true,"quotations":true,"calendar":true,"automations":true,"ai_agents":true,"reports":true,"settings":true,"manage_team":true}'::jsonb,true),
    (p_tenant_id,'manager','Gerente','Supervisa ventas y operación','{"dashboard":true,"companies":true,"contacts":true,"pipeline":true,"inbox":true,"products":true,"quotations":true,"calendar":true,"reports":true,"manage_team":false}'::jsonb,true),
    (p_tenant_id,'sales','Vendedor','Trabaja sus contactos, oportunidades y seguimientos','{"dashboard":true,"companies":true,"contacts":true,"pipeline":true,"inbox":true,"quotations":true,"calendar":true,"reports":false,"settings":false}'::jsonb,true),
    (p_tenant_id,'viewer','Solo lectura','Consulta información autorizada sin gestionar configuración','{"dashboard":true,"companies":true,"contacts":true,"pipeline":true,"reports":true,"write":false}'::jsonb,true)
  on conflict (tenant_id,role_key) do nothing;
end;
$$;

select private.seed_default_tenant_roles(t.id) from public.tenants t;

insert into public.tenant_role_bindings(tenant_id,user_id,role_id)
select m.tenant_id,
       m.user_id,
       tr.id
from public.memberships m
join public.tenant_roles tr
  on tr.tenant_id=m.tenant_id
 and tr.role_key = case
   when m.role in ('owner','admin','manager','sales','viewer') then m.role
   when m.role = 'member' then 'sales'
   else 'viewer'
 end
where m.status='active'
on conflict (tenant_id,user_id) do nothing;

create or replace function private.after_tenant_seed_roles()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  perform private.seed_default_tenant_roles(new.id);
  return new;
end;
$$;
drop trigger if exists tenants_seed_default_roles on public.tenants;
create trigger tenants_seed_default_roles
after insert on public.tenants
for each row execute function private.after_tenant_seed_roles();

create or replace function private.after_membership_bind_role()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare v_role_id uuid;
begin
  perform private.seed_default_tenant_roles(new.tenant_id);
  select tr.id into v_role_id
  from public.tenant_roles tr
  where tr.tenant_id=new.tenant_id
    and tr.role_key = case
      when new.role in ('owner','admin','manager','sales','viewer') then new.role
      when new.role='member' then 'sales'
      else 'viewer'
    end
  limit 1;
  if v_role_id is not null then
    insert into public.tenant_role_bindings(tenant_id,user_id,role_id)
    values(new.tenant_id,new.user_id,v_role_id)
    on conflict (tenant_id,user_id) do update set role_id=excluded.role_id,updated_at=now();
  end if;
  return new;
end;
$$;
drop trigger if exists memberships_bind_default_role on public.memberships;
create trigger memberships_bind_default_role
after insert or update of role,status on public.memberships
for each row
when (new.status='active')
execute function private.after_membership_bind_role();

create or replace function public.tenant_current_permissions(p_tenant_id uuid)
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select case
    when private.crm_is_platform_admin() then '{"all":true}'::jsonb
    else coalesce((
      select tr.permissions
      from public.tenant_role_bindings b
      join public.tenant_roles tr on tr.id=b.role_id and tr.tenant_id=b.tenant_id
      where b.tenant_id=p_tenant_id and b.user_id=auth.uid()
      limit 1
    ), '{}'::jsonb)
  end;
$$;
revoke all on function public.tenant_current_permissions(uuid) from public, anon;
grant execute on function public.tenant_current_permissions(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Reusable CRM templates. Cita-24 is configuration, not a code fork.
-- -----------------------------------------------------------------------------
create table if not exists public.crm_templates (
  id uuid primary key default gen_random_uuid(),
  template_key text not null unique,
  name text not null,
  vertical text not null,
  description text,
  version integer not null default 1,
  status text not null default 'active' check(status in ('draft','active','archived')),
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_template_modules (
  template_id uuid not null references public.crm_templates(id) on delete cascade,
  module_key text not null references public.platform_modules(module_key) on delete cascade,
  enabled boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  primary key(template_id,module_key)
);

create table if not exists public.crm_template_pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.crm_templates(id) on delete cascade,
  pipeline_name text not null,
  stage_key text not null,
  name text not null,
  position integer not null,
  win_probability numeric not null default 0 check(win_probability between 0 and 1),
  stage_type text not null default 'open' check(stage_type in ('open','won','lost')),
  unique(template_id,pipeline_name,stage_key)
);

create table if not exists public.tenant_template_installs (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  template_id uuid not null references public.crm_templates(id) on delete cascade,
  template_version integer not null,
  status text not null default 'installed' check(status in ('installed','disabled')),
  installed_by uuid default auth.uid(),
  installed_at timestamptz not null default now(),
  config jsonb not null default '{}'::jsonb,
  primary key(tenant_id,template_id)
);

alter table public.crm_templates enable row level security;
alter table public.crm_template_modules enable row level security;
alter table public.crm_template_pipeline_stages enable row level security;
alter table public.tenant_template_installs enable row level security;

drop policy if exists crm_templates_read on public.crm_templates;
create policy crm_templates_read on public.crm_templates for select to authenticated using(status='active' or private.crm_is_platform_admin());
drop policy if exists crm_templates_manage on public.crm_templates;
create policy crm_templates_manage on public.crm_templates for all to authenticated using(private.crm_is_platform_admin()) with check(private.crm_is_platform_admin());
drop policy if exists crm_template_modules_read on public.crm_template_modules;
create policy crm_template_modules_read on public.crm_template_modules for select to authenticated using(true);
drop policy if exists crm_template_modules_manage on public.crm_template_modules;
create policy crm_template_modules_manage on public.crm_template_modules for all to authenticated using(private.crm_is_platform_admin()) with check(private.crm_is_platform_admin());
drop policy if exists crm_template_pipeline_stages_read on public.crm_template_pipeline_stages;
create policy crm_template_pipeline_stages_read on public.crm_template_pipeline_stages for select to authenticated using(true);
drop policy if exists crm_template_pipeline_stages_manage on public.crm_template_pipeline_stages;
create policy crm_template_pipeline_stages_manage on public.crm_template_pipeline_stages for all to authenticated using(private.crm_is_platform_admin()) with check(private.crm_is_platform_admin());
drop policy if exists tenant_template_installs_read on public.tenant_template_installs;
create policy tenant_template_installs_read on public.tenant_template_installs for select to authenticated using(private.crm_is_tenant_member(tenant_id));
drop policy if exists tenant_template_installs_manage on public.tenant_template_installs;
create policy tenant_template_installs_manage on public.tenant_template_installs for all to authenticated using(private.crm_is_tenant_admin(tenant_id)) with check(private.crm_is_tenant_admin(tenant_id));

insert into public.crm_templates(template_key,name,vertical,description,version,status,config)
values(
  'cita-24',
  'Sistema Cita-24',
  'clinics',
  'Revenue Automation para clínicas dentales y estéticas: captura, seguimiento, citas, recuperación y conversión.',
  1,
  'active',
  '{"lead_fields":["source","service_requested","lead_score","owner","potential_value","loss_reason"],"goal":"capture-organize-follow-recover-convert"}'::jsonb
)
on conflict(template_key) do update
set name=excluded.name,description=excluded.description,version=excluded.version,status=excluded.status,config=excluded.config,updated_at=now();

insert into public.crm_template_modules(template_id,module_key,enabled)
select t.id,m.module_key,true
from public.crm_templates t
join public.platform_modules m on m.module_key in ('dashboard','companies','contacts','pipeline','inbox','quotations','calendar','automations','reports','settings')
where t.template_key='cita-24'
on conflict(template_id,module_key) do update set enabled=true;

insert into public.crm_template_pipeline_stages(template_id,pipeline_name,stage_key,name,position,win_probability,stage_type)
select t.id,'Cita-24',s.stage_key,s.name,s.position,s.probability,s.stage_type
from public.crm_templates t
cross join (values
  ('new_lead','Nuevo lead',10,0.05::numeric,'open'),
  ('contacted','Contactado',20,0.10::numeric,'open'),
  ('qualified','Calificado',30,0.20::numeric,'open'),
  ('appointment_pending','Cita pendiente',40,0.30::numeric,'open'),
  ('appointment_booked','Cita agendada',50,0.45::numeric,'open'),
  ('confirmed','Confirmada',60,0.55::numeric,'open'),
  ('attended','Asistió',70,0.70::numeric,'open'),
  ('treatment','Venta/Tratamiento',80,0.85::numeric,'open'),
  ('follow_up','Seguimiento',90,0.90::numeric,'open'),
  ('won','Ganado',100,1.00::numeric,'won'),
  ('lost','Perdido',110,0.00::numeric,'lost')
) s(stage_key,name,position,probability,stage_type)
where t.template_key='cita-24'
on conflict(template_id,pipeline_name,stage_key) do update
set name=excluded.name,position=excluded.position,win_probability=excluded.win_probability,stage_type=excluded.stage_type;

create or replace function public.install_crm_template(p_tenant_id uuid,p_template_key text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_template public.crm_templates%rowtype;
  v_pipeline_id uuid;
  v_module record;
  v_stage record;
begin
  if not private.crm_is_tenant_admin(p_tenant_id) then
    raise exception 'Insufficient privileges for tenant';
  end if;

  select * into v_template from public.crm_templates where template_key=p_template_key and status='active';
  if v_template.id is null then raise exception 'Template not found'; end if;

  for v_module in
    select * from public.crm_template_modules where template_id=v_template.id
  loop
    insert into public.tenant_module_overrides(tenant_id,module_key,enabled,config)
    values(p_tenant_id,v_module.module_key,v_module.enabled,v_module.config)
    on conflict(tenant_id,module_key) do update set enabled=excluded.enabled,config=excluded.config,updated_at=now();
  end loop;

  for v_stage in
    select * from public.crm_template_pipeline_stages where template_id=v_template.id order by pipeline_name,position
  loop
    select p.id into v_pipeline_id
    from public.pipelines p
    where p.tenant_id=p_tenant_id and p.name=v_stage.pipeline_name
    order by p.created_at asc limit 1;

    if v_pipeline_id is null then
      insert into public.pipelines(tenant_id,name,is_default,created_by)
      values(p_tenant_id,v_stage.pipeline_name,false,auth.uid())
      returning id into v_pipeline_id;
    end if;

    insert into public.pipeline_stages(tenant_id,pipeline_id,name,position,win_probability,stage_type)
    select p_tenant_id,v_pipeline_id,v_stage.name,v_stage.position,v_stage.win_probability,v_stage.stage_type
    where not exists(
      select 1 from public.pipeline_stages ps
      where ps.tenant_id=p_tenant_id and ps.pipeline_id=v_pipeline_id and ps.name=v_stage.name
    );
  end loop;

  insert into public.tenant_template_installs(tenant_id,template_id,template_version,status,installed_by,config)
  values(p_tenant_id,v_template.id,v_template.version,'installed',auth.uid(),v_template.config)
  on conflict(tenant_id,template_id) do update
    set template_version=excluded.template_version,status='installed',installed_by=auth.uid(),installed_at=now(),config=excluded.config;

  insert into public.audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,metadata)
  values(p_tenant_id,auth.uid(),'template.installed','crm_template',v_template.id,jsonb_build_object('template_key',v_template.template_key,'version',v_template.version));

  return jsonb_build_object('template_key',v_template.template_key,'template_version',v_template.version,'pipeline_id',v_pipeline_id);
end;
$$;
revoke all on function public.install_crm_template(uuid,text) from public,anon;
grant execute on function public.install_crm_template(uuid,text) to authenticated;

-- -----------------------------------------------------------------------------
-- ERP abstraction. Credentials are intentionally NOT stored in this client-readable
-- table. Sensitive Odoo credentials must be server-side/Vault-backed.
-- -----------------------------------------------------------------------------
create table if not exists public.erp_connections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  provider text not null default 'odoo',
  display_name text not null default 'Odoo',
  base_url text,
  database_name text,
  username_hint text,
  status text not null default 'not_configured' check(status in ('not_configured','configured','connected','error','disabled')),
  credential_status text not null default 'missing' check(credential_status in ('missing','configured','rotation_required')),
  last_healthcheck_at timestamptz,
  last_sync_at timestamptz,
  config jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id,provider)
);

alter table public.erp_connections enable row level security;
drop policy if exists erp_connections_read on public.erp_connections;
create policy erp_connections_read on public.erp_connections for select to authenticated using(private.crm_is_tenant_member(tenant_id));
drop policy if exists erp_connections_manage on public.erp_connections;
create policy erp_connections_manage on public.erp_connections for all to authenticated using(private.crm_is_tenant_admin(tenant_id)) with check(private.crm_is_tenant_admin(tenant_id));

-- -----------------------------------------------------------------------------
-- Platform-admin RPCs. Keep global access behind audited, server-side checks.
-- -----------------------------------------------------------------------------
create or replace function public.platform_admin_tenants()
returns table(
  tenant_id uuid,
  tenant_name text,
  tenant_slug text,
  owner_user_id uuid,
  plan_code text,
  subscription_status text,
  member_count bigint,
  created_at timestamptz
)
language plpgsql
security definer
set search_path=''
as $$
begin
  if not private.crm_is_platform_admin() then raise exception 'Platform admin required'; end if;
  return query
  select t.id,t.name,t.slug,t.owner_user_id,p.code,ts.status,
         (select count(*) from public.memberships m where m.tenant_id=t.id and m.status='active'),
         t.created_at
  from public.tenants t
  left join public.tenant_subscriptions ts on ts.tenant_id=t.id
  left join public.plans p on p.id=ts.plan_id
  order by t.created_at desc;
end;
$$;
revoke all on function public.platform_admin_tenants() from public,anon;
grant execute on function public.platform_admin_tenants() to authenticated;

create or replace function public.platform_admin_members(p_tenant_id uuid)
returns table(user_id uuid,email text,membership_role text,membership_status text,role_key text,role_name text)
language plpgsql
security definer
set search_path=''
as $$
begin
  if not private.crm_is_platform_admin() then raise exception 'Platform admin required'; end if;
  return query
  select m.user_id,u.email::text,m.role,m.status,tr.role_key,tr.name
  from public.memberships m
  left join auth.users u on u.id=m.user_id
  left join public.tenant_role_bindings b on b.tenant_id=m.tenant_id and b.user_id=m.user_id
  left join public.tenant_roles tr on tr.id=b.role_id
  where m.tenant_id=p_tenant_id
  order by case when m.role='owner' then 0 else 1 end,u.email;
end;
$$;
revoke all on function public.platform_admin_members(uuid) from public,anon;
grant execute on function public.platform_admin_members(uuid) to authenticated;

create or replace function public.platform_set_tenant_module(p_tenant_id uuid,p_module_key text,p_enabled boolean,p_config jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  if not private.crm_is_platform_admin() then raise exception 'Platform admin required'; end if;
  insert into public.tenant_module_overrides(tenant_id,module_key,enabled,config,created_by)
  values(p_tenant_id,p_module_key,p_enabled,coalesce(p_config,'{}'::jsonb),auth.uid())
  on conflict(tenant_id,module_key) do update set enabled=excluded.enabled,config=excluded.config,updated_at=now();
  insert into public.audit_logs(tenant_id,actor_user_id,action,entity_type,metadata)
  values(p_tenant_id,auth.uid(),'platform.module_changed','module',jsonb_build_object('module_key',p_module_key,'enabled',p_enabled));
end;
$$;
revoke all on function public.platform_set_tenant_module(uuid,text,boolean,jsonb) from public,anon;
grant execute on function public.platform_set_tenant_module(uuid,text,boolean,jsonb) to authenticated;

create or replace function public.platform_assign_plan(p_tenant_id uuid,p_plan_code text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_plan_id uuid;
begin
  if not private.crm_is_platform_admin() then raise exception 'Platform admin required'; end if;
  select p.id into v_plan_id from public.plans p where p.code=p_plan_code limit 1;
  if v_plan_id is null then raise exception 'Plan not found'; end if;

  update public.tenant_subscriptions set plan_id=v_plan_id,status='active',provider='manual' where tenant_id=p_tenant_id;
  if not found then
    insert into public.tenant_subscriptions(tenant_id,plan_id,status,provider)
    values(p_tenant_id,v_plan_id,'active','manual');
  end if;

  insert into public.audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,metadata)
  values(p_tenant_id,auth.uid(),'platform.plan_assigned','subscription',v_plan_id,jsonb_build_object('plan_code',p_plan_code));
  return jsonb_build_object('tenant_id',p_tenant_id,'plan_code',p_plan_code,'status','active');
end;
$$;
revoke all on function public.platform_assign_plan(uuid,text) from public,anon;
grant execute on function public.platform_assign_plan(uuid,text) to authenticated;

create or replace function public.platform_join_tenant_as_admin(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
begin
  if not private.crm_is_platform_admin() then raise exception 'Platform admin required'; end if;

  insert into public.memberships(tenant_id,user_id,role,status)
  values(p_tenant_id,auth.uid(),'admin','active')
  on conflict(tenant_id,user_id) do update set role='admin',status='active';

  insert into public.audit_logs(tenant_id,actor_user_id,action,entity_type,metadata)
  values(p_tenant_id,auth.uid(),'platform.support_access_granted','membership',jsonb_build_object('reason','platform_admin_tenant_access'));

  return jsonb_build_object('tenant_id',p_tenant_id,'role','admin');
end;
$$;
revoke all on function public.platform_join_tenant_as_admin(uuid) from public,anon;
grant execute on function public.platform_join_tenant_as_admin(uuid) to authenticated;
