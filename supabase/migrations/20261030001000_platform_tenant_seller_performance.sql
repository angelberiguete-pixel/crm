-- Read-only evidence-based per-seller metrics for platform owners.
-- These reflect CURRENT assignments, not historical attribution or guaranteed sales.
-- Deny untrusted callers even though the function runs with privileged SQL visibility.
create or replace function public.platform_tenant_seller_performance(p_tenant_id uuid)
returns jsonb
language plpgsql stable security definer set search_path=''
as $$
declare v_summary jsonb;
begin
  if auth.uid() is null or not private.crm_is_platform_admin() then
    raise exception 'platform_admin_only' using errcode='42501';
  end if;
  if not exists (select 1 from public.tenants t where t.id=p_tenant_id) then
    raise exception 'tenant_not_found' using errcode='22023';
  end if;

  select jsonb_build_object(
    'total_conversations', (select count(*) from public.conversations c where c.tenant_id=p_tenant_id),
    'unassigned_conversations', (select count(*) from public.conversations c where c.tenant_id=p_tenant_id and c.assigned_to is null),
    'sellers', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'user_id',m.user_id,
          'display_name',coalesce(nullif(up.full_name,''),
            nullif(au.raw_user_meta_data->>'display_name',''),
            case when au.email like 'family-power.%@login.looksocialmedia.invalid'
              then replace(split_part(au.email,'@',1),'family-power.','') end,
            au.email,m.user_id::text),
          'role',coalesce(tr.role_key,m.role),
          'assigned_conversations',(select count(*) from public.conversations c
            where c.tenant_id=p_tenant_id and c.assigned_to=m.user_id),
          'open_assigned',(select count(*) from public.conversations c
            where c.tenant_id=p_tenant_id and c.assigned_to=m.user_id and c.status<>'closed'),
          'closed_assigned',(select count(*) from public.conversations c
            where c.tenant_id=p_tenant_id and c.assigned_to=m.user_id and c.status='closed'),
          'sent_human_messages',(select count(*) from public.messages msg
            where msg.tenant_id=p_tenant_id and msg.sender_user_id=m.user_id and
              msg.direction='outbound' and msg.sender_type='user' and msg.status in ('sent','delivered','read')),
          'quotes_created',(select count(*) from public.quotations q
            where q.tenant_id=p_tenant_id and q.created_by=m.user_id),
          'quotes_accepted',(select count(*) from public.quotations q
            where q.tenant_id=p_tenant_id and q.created_by=m.user_id and q.accepted_at is not null)
        ) order by coalesce(up.full_name,au.email,m.user_id::text)
      )
      from public.memberships m
      left join public.tenant_role_bindings rb on rb.tenant_id=m.tenant_id and rb.user_id=m.user_id
      left join public.tenant_roles tr on tr.id=rb.role_id and tr.tenant_id=m.tenant_id
      left join public.user_profiles up on up.user_id=m.user_id
      left join auth.users au on au.id=m.user_id
      where m.tenant_id=p_tenant_id and m.status='active'
        and (tr.role_key='sales' or (tr.id is null and m.role='agent'))
    ),'[]'::jsonb)
  ) into v_summary;
  return v_summary;
end;
$$;
revoke all on function public.platform_tenant_seller_performance(uuid)
  from public,anon,authenticated;
grant execute on function public.platform_tenant_seller_performance(uuid) to authenticated;
comment on function public.platform_tenant_seller_performance(uuid) is
  'Global platform admin only. Current assignment and auditable message/quote activity. Counts are factual, not conversion attribution or historical productivity.';
