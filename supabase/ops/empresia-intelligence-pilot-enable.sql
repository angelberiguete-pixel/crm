-- Manual, audited opt-in for Empresia ONLY. Never run in Preview against Supabase production.
-- Requires prior smoke tests, RLS review, explicit authorized production rollout.
begin;
do $pilot$
declare v_id uuid;
begin
 select id into v_id from public.tenants where slug='eurevector' and status='active';
 if v_id is null then raise exception 'empresia_tenant_not_active'; end if;
 if not exists (select 1 from public.empresia_brain_events limit 0) then
  raise exception 'brain_migration_missing';
 end if;
 insert into private.empresia_brain_tenant_pilots(tenant_id,enabled,activated_at)
 values(v_id,true,now())
 on conflict(tenant_id) do update set enabled=true,activated_at=now();
 if exists(select 1 from private.empresia_brain_tenant_pilots p
    join public.tenants t on t.id=p.tenant_id
    where p.enabled and t.slug<>'eurevector') then
  raise exception 'another_tenant_pilot_already_enabled';
 end if;
end;
$pilot$;
commit;
