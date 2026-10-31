-- Source-backed, read-only global company analytics for platform administrators.
-- NEVER infer customer invoices from the platform subscription invoices or treat a
-- prospect's projected opportunity value as earned or collected revenue.
-- Uses the existing access predicate, keeps tenant data isolated and returns
-- 'not_integrated' for CRM metrics without an authoritative data source.
create or replace function public.platform_admin_tenant_analytics(p_tenant_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path = ''
as $$
declare v_result jsonb;
begin
  if not private.crm_is_platform_admin() then
    raise exception 'Platform admin required' using errcode='42501';
  end if;
  if not exists(select 1 from public.tenants t where t.id=p_tenant_id) then
    raise exception 'Company not found' using errcode='P0002';
  end if;
  select pg_catalog.jsonb_build_object(
    'tenant_id',p_tenant_id,
    'calculated_at',now(),
    'counts',pg_catalog.jsonb_build_object(
      'contacts',(select count(*) from public.contacts where tenant_id=p_tenant_id),
      'crm_companies',(select count(*) from public.companies where tenant_id=p_tenant_id),
      'conversations',(select count(*) from public.conversations where tenant_id=p_tenant_id),
      'assigned_conversations',(select count(*) from public.conversations where tenant_id=p_tenant_id and assigned_to is not null),
      'unassigned_conversations',(select count(*) from public.conversations where tenant_id=p_tenant_id and assigned_to is null),
      'inbound_messages',(select count(*) from public.messages where tenant_id=p_tenant_id and direction='inbound'),
      'human_reply_messages',(select count(*) from public.messages where tenant_id=p_tenant_id and direction='outbound' and sender_type='user'),
      'quotations',(select count(*) from public.quotations where tenant_id=p_tenant_id),
      'opportunities',(select count(*) from public.opportunities where tenant_id=p_tenant_id),
      'orders',(select count(*) from public.orders where tenant_id=p_tenant_id)
    ),
    'quotations_by_currency',
      coalesce((
        select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'currency',x.currency,'count',x.n,'total',x.total,
          'accepted_total',x.accepted_total,'accepted_count',x.accepted_count,
          'sent_count',x.sent_count
        ) order by x.currency)
        from(
          select q.currency,count(*) n,
            coalesce(sum(q.total),0) total,
            coalesce(sum(q.total) filter(where q.status='accepted'),0) accepted_total,
            count(*) filter(where q.status='accepted') accepted_count,
            count(*) filter(where q.status='sent') sent_count
          from public.quotations q where q.tenant_id=p_tenant_id group by q.currency
        ) x
      ),'[]'::jsonb),
    'opportunities_by_currency',
      coalesce((
        select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'currency',x.currency,'count',x.n,'open_amount',x.open_amount,
          'won_amount',x.won_amount,'won_count',x.won_count
        ) order by x.currency)
        from(
          select o.currency,count(*) n,
            coalesce(sum(o.value) filter(where o.status='open'),0) open_amount,
            coalesce(sum(o.value) filter(where o.status='won'),0) won_amount,
            count(*) filter(where o.status='won') won_count
          from public.opportunities o where o.tenant_id=p_tenant_id group by o.currency
        ) x
      ),'[]'::jsonb),
    'channel_status',
      coalesce((
        select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'provider',c.provider,'name',c.name,'status',c.status
        ) order by c.provider,c.name)
        from public.channels c where c.tenant_id=p_tenant_id
      ),'[]'::jsonb),
    'sellers',
      coalesce((
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'user_id',m.user_id,'role',m.role,
            'assigned_conversations',(
              select count(*) from public.conversations c
              where c.tenant_id=p_tenant_id and c.assigned_to=m.user_id),
            'conversations_replied_to',(
              select count(distinct msg.conversation_id) from public.messages msg
              where msg.tenant_id=p_tenant_id and msg.sender_user_id=m.user_id
                and msg.direction='outbound' and msg.sender_type='user'),
            'reply_messages',(
              select count(*) from public.messages msg
              where msg.tenant_id=p_tenant_id and msg.sender_user_id=m.user_id
                and msg.direction='outbound' and msg.sender_type='user'),
            'opportunities_assigned',(
              select count(*) from public.opportunities o
              where o.tenant_id=p_tenant_id and o.owner_user_id=m.user_id),
            'opportunities_won',(
              select count(*) from public.opportunities o
              where o.tenant_id=p_tenant_id and o.owner_user_id=m.user_id and o.status='won'),
            'quotations_authored',(
              select count(*) from public.quotations q
              where q.tenant_id=p_tenant_id and q.created_by=m.user_id)
          ) order by m.role,m.user_id)
        from public.memberships m
        where m.tenant_id=p_tenant_id and m.status='active'
      ),'[]'::jsonb),
    'invoices',pg_catalog.jsonb_build_object(
      'state','not_integrated','count',null,'total',null,
      'reason','Sin módulo de facturas comerciales verificadas en este CRM; las facturas de suscripción de la plataforma no equivalen a ventas del cliente.'),
    'meta_pixel',pg_catalog.jsonb_build_object(
      'state','not_integrated','events',null,'attributed_leads',null,
      'reason','Sin integración de telemetría de Meta Pixel/CAPI que permita consultar resultados verificables.')
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function public.platform_admin_tenant_analytics(uuid) from public,anon,authenticated;
grant execute on function public.platform_admin_tenant_analytics(uuid) to authenticated,service_role;
comment on function public.platform_admin_tenant_analytics(uuid)
 is 'Read-only tenant metrics; checks platform admin and distinguishes CRM pipeline, quotes, invoicing and Meta pixel telemetry.';
