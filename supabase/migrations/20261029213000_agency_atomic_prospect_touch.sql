-- Atomic, audited commercial activity entry. UI never sends WhatsApp or invoices.
-- Authenticated platform administrator only. Security INVOKER + existing RLS.
create or replace function public.agency_record_prospect_touch(
  p_prospect_id uuid, p_activity_type text, p_summary text,
  p_outcome text default null, p_stage text default null,
  p_next_action text default null, p_next_action_at timestamptz default null
) returns jsonb
language plpgsql security invoker set search_path=''
as $$
declare
  v_user uuid:=auth.uid();
  v_old public.agency_prospects%rowtype;
  v_activity_id uuid;
  v_at timestamptz:=now();
  v_contacted boolean;
begin
  if v_user is null or not private.is_platform_admin()
  then raise exception 'platform_admin_only' using errcode='42501'; end if;
  if p_prospect_id is null or p_activity_type not in
    ('call','whatsapp','email','meeting','proposal','note','task')
    or p_summary is null or length(btrim(p_summary)) not between 3 and 1200
    or length(coalesce(p_outcome,''))>200
    or (p_stage is not null and p_stage not in
      ('prospecto','contactado','respondio','reunion','calificado','propuesta','negociacion','ganado','perdido'))
    or length(coalesce(p_next_action,''))>300
  then raise exception 'invalid_activity' using errcode='22023'; end if;

  select * into v_old from public.agency_prospects
    where id=p_prospect_id for update;
  if not found then raise exception 'prospect_not_found' using errcode='P0002'; end if;
  v_contacted:=p_activity_type in ('call','whatsapp','email','meeting','proposal');
  -- Last contact is an observed outreach action only, not an inferred response.
  -- Stage transitions are ALWAYS explicit: a missed call is not a contacted lead.
  update public.agency_prospects
  set stage=coalesce(p_stage,stage),
      last_contact_at=case when v_contacted then v_at else last_contact_at end,
      next_action=nullif(btrim(coalesce(p_next_action,'')),''),
      next_action_at=case when nullif(btrim(coalesce(p_next_action,'')),'') is null
                          then null else p_next_action_at end,
      updated_at=now()
  where id=p_prospect_id;
  insert into public.agency_prospect_activities(
    prospect_id,activity_type,summary,outcome,occurred_at,next_action,next_action_at,created_by)
  values(p_prospect_id,p_activity_type,btrim(p_summary),
     nullif(btrim(coalesce(p_outcome,'')),''),v_at,
     nullif(btrim(coalesce(p_next_action,'')),''),p_next_action_at,v_user)
  returning id into v_activity_id;

  return pg_catalog.jsonb_build_object('activity_id',v_activity_id,
     'prospect_id',p_prospect_id,'last_contact_updated',v_contacted,
     'stage',coalesce(p_stage,v_old.stage));
end;
$$;
revoke all on function public.agency_record_prospect_touch(
 uuid,text,text,text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.agency_record_prospect_touch(
 uuid,text,text,text,text,text,timestamptz) to authenticated;
comment on function public.agency_record_prospect_touch(uuid,text,text,text,text,text,timestamptz)
 is 'Transactional, RLS-protected real prospect touch; never sends outbound messages or fabricates a contact.';
