-- HUMAN-APPROVED STAGING ACTIVITY ONLY. Do not run on production or Family Power.
-- Enroll Empresia only after both engines have been authenticated with approved
-- read-only keys, backups tested, and an isolated QA database prepared.
begin;
do $enroll$
declare v_tenant uuid;
declare v_odoo integer;declare v_dolibarr integer;
begin
 select id into v_tenant from public.tenants where slug='eurevector' and status='active';
 if v_tenant is null then raise exception 'empresia_tenant_not_found'; end if;
 select count(*) filter(where provider='odoo' and status='connected'
            and last_healthcheck_at>now()-interval '24 hours'),
        count(*) filter(where provider='dolibarr' and status='connected'
            and last_healthcheck_at>now()-interval '24 hours')
   into v_odoo,v_dolibarr from public.erp_connections where tenant_id=v_tenant;
 if v_odoo<>1 or v_dolibarr<>1 then
   raise exception 'erp_two_recently_healthy_unique_connections_required';end if;
 if exists(select 1 from private.erp_dual_tenant_enrollments e
  join public.tenants t on t.id=e.tenant_id
  where e.enabled and t.slug<>'eurevector') then
   raise exception 'another_tenant_erp_dual_integration_enabled';end if;
 insert into private.erp_dual_tenant_enrollments(tenant_id,enabled,enabled_at)
 values(v_tenant,true,now())
 on conflict(tenant_id) do update set enabled=true,enabled_at=now();
 insert into public.erp_dual_domain_policy(tenant_id,domain,canonical_system,sync_mode)
 select v_tenant,domain,'empresia','disabled'
 from unnest(array[
  'contacts','products','inventory','orders','purchases',
  'invoices','payments','accounting','installations','documents'
 ]) domain on conflict(tenant_id,domain) do nothing;
end;
$enroll$;
commit;
