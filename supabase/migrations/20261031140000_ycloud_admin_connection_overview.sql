-- Administrator-only, read-only YCloud channel status.
-- Never return webhook/API secrets or raw message content.
create or replace function public.tenant_ycloud_connection_status(p_tenant_id uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare v_rows jsonb;
begin
 if auth.uid() is null or not (
   private.crm_is_tenant_admin(p_tenant_id) or private.crm_is_platform_admin()
 ) then raise exception 'Not permitted' using errcode='42501';end if;
 if not exists(select 1 from public.tenants t where t.id=p_tenant_id)
 then raise exception 'Unknown company' using errcode='P0002';end if;
 select coalesce(jsonb_agg(jsonb_build_object(
   'channel_name',x.channel_name,'phone',x.business_phone_e164,'waba_id',x.waba_id,
   'is_enabled',x.is_enabled,'verified_at',x.verified_at,
   'channel_status',x.channel_status,
   'inbound_message_count',x.inbound_count,'last_inbound_at',x.last_inbound
 ) order by x.channel_name),'[]'::jsonb)
 into v_rows
 from (
   select ch.name channel_name,ch.status channel_status,
     r.business_phone_e164,r.waba_id,r.is_enabled,r.verified_at,
     (select count(*) from public.ycloud_whatsapp_inbound_receipts rx
       where rx.tenant_id=p_tenant_id and rx.channel_id=r.channel_id) inbound_count,
     (select max(rx.created_at) from public.ycloud_whatsapp_inbound_receipts rx
       where rx.tenant_id=p_tenant_id and rx.channel_id=r.channel_id) last_inbound
   from public.ycloud_whatsapp_routes r
   join public.channels ch on ch.tenant_id=r.tenant_id and ch.id=r.channel_id
   where r.tenant_id=p_tenant_id
 ) x;
 return jsonb_build_object('tenant_id',p_tenant_id,
   'routes',v_rows,
   'provider_ready',exists(select 1 from public.ycloud_whatsapp_routes r
     join public.channels ch on ch.tenant_id=r.tenant_id and ch.id=r.channel_id
     where r.tenant_id=p_tenant_id and r.is_enabled and ch.status='connected'),
   'outbound_send_tested',false,
   'meta_events_export_enabled',false);
end;
$$;
revoke all on function public.tenant_ycloud_connection_status(uuid)
  from public,anon,authenticated;
grant execute on function public.tenant_ycloud_connection_status(uuid)
  to authenticated;
comment on function public.tenant_ycloud_connection_status(uuid)
 is 'Read-only YCloud provider status for company administrators; no secrets.';
