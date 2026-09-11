alter table public.opportunities
  add column if not exists setup_value numeric not null default 0 check (setup_value >= 0),
  add column if not exists mrr_value numeric not null default 0 check (mrr_value >= 0),
  add column if not exists total_contract_value numeric not null default 0 check (total_contract_value >= 0),
  add column if not exists actual_close_date date,
  add column if not exists acquisition_source text,
  add column if not exists offer text,
  add column if not exists loss_reason text,
  add column if not exists lead_score integer not null default 0 check (lead_score between 0 and 100),
  add column if not exists next_action text,
  add column if not exists next_action_at timestamptz,
  add column if not exists last_activity_at timestamptz,
  add column if not exists setup_collected numeric not null default 0 check (setup_collected >= 0),
  add column if not exists recurring_cash_collected numeric not null default 0 check (recurring_cash_collected >= 0),
  add column if not exists metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object');

alter table public.companies
  add column if not exists website text,
  add column if not exists instagram_url text,
  add column if not exists whatsapp_phone text,
  add column if not exists city text,
  add column if not exists sector text;

alter table public.contacts
  add column if not exists job_title text,
  add column if not exists whatsapp_phone text;

alter table public.activities drop constraint if exists activities_type_check;
alter table public.activities add constraint activities_type_check
  check (type = any (array['task','call','meeting','note','email','message','follow_up','whatsapp','linkedin','proposal','other']::text[]));

create index if not exists opportunities_tenant_next_action_idx on public.opportunities (tenant_id, next_action_at) where status = 'open';
create index if not exists opportunities_tenant_score_idx on public.opportunities (tenant_id, lead_score desc) where status = 'open';
create index if not exists opportunities_tenant_source_idx on public.opportunities (tenant_id, acquisition_source) where acquisition_source is not null;
create index if not exists companies_tenant_lower_domain_idx on public.companies (tenant_id, lower(domain)) where domain is not null;
create index if not exists contacts_tenant_lower_email_idx on public.contacts (tenant_id, lower(email)) where email is not null;

create or replace function public.initialize_revenue_command_center(p_tenant_id uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_pipeline_id uuid;
begin
  if not private.is_tenant_admin(p_tenant_id) then raise exception 'insufficient privileges for tenant'; end if;
  select p.id into v_pipeline_id from public.pipelines p where p.tenant_id=p_tenant_id and p.name='Revenue Command Center — RD$1M' order by p.created_at asc limit 1;
  if v_pipeline_id is null then
    insert into public.pipelines (tenant_id,name,is_default) values (p_tenant_id,'Revenue Command Center — RD$1M',false) returning id into v_pipeline_id;
  end if;
  insert into public.pipeline_stages (tenant_id,pipeline_id,name,position,win_probability,stage_type)
  select p_tenant_id,v_pipeline_id,s.name,s.position,s.probability,s.stage_type from (values
    ('Prospecto',10,0.05::numeric,'open'),('Calificado',20,0.10::numeric,'open'),('Contactado',30,0.15::numeric,'open'),('Respondió',40,0.25::numeric,'open'),('Reunión agendada',50,0.40::numeric,'open'),('Diagnóstico realizado',60,0.55::numeric,'open'),('Propuesta enviada',70,0.70::numeric,'open'),('Negociación',80,0.85::numeric,'open'),('Ganado',90,1.00::numeric,'won'),('Perdido',100,0.00::numeric,'lost')) s(name,position,probability,stage_type)
  where not exists (select 1 from public.pipeline_stages ps where ps.tenant_id=p_tenant_id and ps.pipeline_id=v_pipeline_id and ps.name=s.name);
  insert into public.tenant_settings (tenant_id,settings)
  values (p_tenant_id,jsonb_build_object('revenue_command_center',jsonb_build_object('mrr_goal',1000000,'currency','DOP','initial_30_day_goal',jsonb_build_object('clients',3,'setup_revenue',180000,'new_mrr',135000,'pilot_setup_price',60000,'pilot_mrr_price',45000),'funnel_target',jsonb_build_object('prospects',130,'responses',26,'meetings',13,'proposals',9,'wins',3))))
  on conflict (tenant_id) do update set settings=public.tenant_settings.settings||excluded.settings,updated_at=now();
  return v_pipeline_id;
end; $$;
revoke all on function public.initialize_revenue_command_center(uuid) from public,anon;
grant execute on function public.initialize_revenue_command_center(uuid) to authenticated;

create or replace view public.revenue_command_center_opportunities with (security_invoker = true) as
select o.id,o.tenant_id,o.pipeline_id,o.stage_id,ps.name as stage_name,ps.position as stage_position,ps.win_probability as stage_probability,o.contact_id,o.company_id,co.name as company_name,co.city,co.sector,co.domain,co.website,co.instagram_url,co.whatsapp_phone as company_whatsapp,c.display_name as contact_name,c.job_title,c.email as contact_email,c.phone as contact_phone,c.whatsapp_phone as contact_whatsapp,o.title,o.status,o.currency,o.value,o.setup_value,o.mrr_value,o.total_contract_value,o.probability,round(o.mrr_value*o.probability,2) as weighted_mrr,round(o.setup_value*o.probability,2) as weighted_setup,o.setup_collected,o.recurring_cash_collected,(o.setup_collected+o.recurring_cash_collected) as cash_collected,o.acquisition_source,o.offer,o.loss_reason,o.lead_score,o.expected_close_date,o.actual_close_date,o.next_action,o.next_action_at,o.last_activity_at,o.owner_user_id,o.metadata,o.created_at,o.updated_at
from public.opportunities o
join public.pipelines p on p.tenant_id=o.tenant_id and p.id=o.pipeline_id
join public.pipeline_stages ps on ps.tenant_id=o.tenant_id and ps.pipeline_id=o.pipeline_id and ps.id=o.stage_id
left join public.companies co on co.tenant_id=o.tenant_id and co.id=o.company_id
left join public.contacts c on c.tenant_id=o.tenant_id and c.id=o.contact_id
where p.name='Revenue Command Center — RD$1M';
grant select on public.revenue_command_center_opportunities to authenticated;
revoke all on public.revenue_command_center_opportunities from anon;

create or replace view public.revenue_command_center_dashboard with (security_invoker = true) as
select o.tenant_id,
 count(*) filter (where o.status='open')::int as open_opportunities,
 count(*) filter (where o.status='won')::int as won_opportunities,
 count(*) filter (where o.status='lost')::int as lost_opportunities,
 coalesce(sum(o.mrr_value) filter (where o.status='won'),0) as current_mrr,
 coalesce(sum(o.mrr_value) filter (where o.status='won' and o.actual_close_date>=date_trunc('month',current_date)::date),0) as new_mrr_this_month,
 coalesce(sum(o.setup_collected),0) as setup_collected,
 coalesce(sum(o.setup_collected+o.recurring_cash_collected),0) as cash_collected,
 coalesce(sum(o.mrr_value) filter (where o.status='open'),0) as open_pipeline_mrr,
 coalesce(sum(o.mrr_value*o.probability) filter (where o.status='open'),0) as weighted_pipeline_mrr,
 coalesce(avg(o.mrr_value) filter (where o.status='won'),0) as avg_won_mrr,
 case when count(*) filter (where o.status in ('won','lost'))=0 then 0 else round(100.0*count(*) filter (where o.status='won')/count(*) filter (where o.status in ('won','lost')),2) end as win_rate_pct,
 max(o.updated_at) as last_pipeline_update
from public.revenue_command_center_opportunities o group by o.tenant_id;
grant select on public.revenue_command_center_dashboard to authenticated;
revoke all on public.revenue_command_center_dashboard from anon;

create or replace view public.revenue_command_center_funnel with (security_invoker = true) as
select o.tenant_id,o.stage_id,o.stage_name,o.stage_position,count(*)::int as opportunity_count,coalesce(sum(o.mrr_value),0) as mrr_value,coalesce(sum(o.weighted_mrr),0) as weighted_mrr
from public.revenue_command_center_opportunities o group by o.tenant_id,o.stage_id,o.stage_name,o.stage_position;
grant select on public.revenue_command_center_funnel to authenticated;
revoke all on public.revenue_command_center_funnel from anon;

create or replace function private.touch_opportunity_last_activity()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.opportunity_id is not null then update public.opportunities set last_activity_at=coalesce(new.completed_at,new.created_at,now()),updated_at=now() where tenant_id=new.tenant_id and id=new.opportunity_id; end if;
 return new;
end; $$;
revoke all on function private.touch_opportunity_last_activity() from public,anon,authenticated;
drop trigger if exists activities_touch_opportunity_last_activity on public.activities;
create trigger activities_touch_opportunity_last_activity after insert or update of completed_at on public.activities for each row execute function private.touch_opportunity_last_activity();
