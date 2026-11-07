-- Family Power public web intake (code-only until rollout/QA).
-- Existing tenant, CRM tables, and RLS are retained. No public table grants.
create table if not exists public.family_power_web_requests (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  request_id uuid not null,
  rate_hash text not null check (rate_hash ~ '^[a-f0-9]{64}$'),
  contact_id uuid not null,
  opportunity_id uuid not null,
  quotation_id uuid not null,
  conversation_id uuid not null,
  created_at timestamptz not null default now(),
  primary key(tenant_id,request_id)
);
alter table public.family_power_web_requests enable row level security;
revoke all on public.family_power_web_requests from public,anon,authenticated;
grant select,insert on public.family_power_web_requests to service_role;
create index if not exists fp_web_requests_rate_window
 on public.family_power_web_requests(tenant_id,rate_hash,created_at desc);

create table if not exists public.family_power_web_sessions (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  token_hash text not null check(token_hash ~ '^[a-f0-9]{64}$'),
  conversation_id uuid not null,
  rate_hash text not null check(rate_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now()+interval '7 days'),
  primary key(tenant_id,token_hash)
);
alter table public.family_power_web_sessions enable row level security;
revoke all on public.family_power_web_sessions from public,anon,authenticated;
grant select,insert,update on public.family_power_web_sessions to service_role;
create index if not exists fp_web_sessions_rate_window
 on public.family_power_web_sessions(tenant_id,rate_hash,created_at desc);

-- Service-role-only transaction. Never accept tenant id, pipeline or price from browser.
create or replace function public.family_power_web_capture_quote(
  p_request_id uuid,p_full_name text,p_phone text,p_items jsonb,
  p_note text,p_location text,p_consent boolean,p_rate_hash text,p_utm jsonb
) returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare
  v_tenant uuid;v_existing record;v_phone text;v_contact uuid;
  v_pipeline uuid;v_stage uuid;v_opportunity uuid;v_quote uuid;
  v_channel uuid;v_conversation uuid;v_number text;v_item jsonb;
  v_service text;v_qty integer;v_position integer:=0;v_name text;
begin
  if current_user <> 'service_role' then
    raise exception 'Forbidden' using errcode='42501';
  end if;
  if p_request_id is null or p_consent is distinct from true
     or p_rate_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid request/consent' using errcode='22023';
  end if;
  v_name=left(btrim(coalesce(p_full_name,'')),100);
  v_phone=regexp_replace(coalesce(p_phone,''),'[^0-9]','','g');
  if length(v_name) not between 2 and 100 or
     length(v_phone) not between 8 and 15 or
     length(btrim(coalesce(p_note,''))) not between 12 and 1500 then
    raise exception 'Invalid contact or description' using errcode='22023';
  end if;
  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'Invalid item list' using errcode='22023';
  end if;
  if jsonb_array_length(p_items) not between 1 and 10 then
    raise exception 'Invalid number of items' using errcode='22023';
  end if;
  select id into v_tenant from public.tenants where slug='family-power' and status='active';
  if v_tenant is null then raise exception 'Company unavailable'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_tenant::text||':'||p_request_id::text,0));
  select * into v_existing from public.family_power_web_requests
   where tenant_id=v_tenant and request_id=p_request_id;
  if found then
    return pg_catalog.jsonb_build_object('ok',true,'request_id',p_request_id,'quotation_id',v_existing.quotation_id,'opportunity_id',v_existing.opportunity_id,'conversation_id',v_existing.conversation_id,'duplicate',true);
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_tenant::text||':'||p_rate_hash,0));
  if (select count(*) from public.family_power_web_requests
      where tenant_id=v_tenant and rate_hash=p_rate_hash and created_at>now()-interval '1 hour')>=5 then
    raise exception 'Rate limited' using errcode='P0001';
  end if;
  select id into v_contact from public.contacts
   where tenant_id=v_tenant and (phone=v_phone or whatsapp_phone=v_phone)
   order by created_at limit 1;
  if v_contact is null then
    insert into public.contacts(tenant_id,display_name,phone,source,status,metadata)
    values(v_tenant,v_name,v_phone,'web','lead',
     pg_catalog.jsonb_build_object('web_consent_at',now(),'web_source','family_power'))
    returning id into v_contact;
  end if;
  select id into v_pipeline from public.pipelines where tenant_id=v_tenant and name='Energía e instalaciones' limit 1;
  if v_pipeline is null then raise exception 'Energy pipeline unavailable'; end if;
  select id into v_stage from public.pipeline_stages
   where tenant_id=v_tenant and pipeline_id=v_pipeline and stage_type='open'
   order by position limit 1;
  if v_stage is null then raise exception 'Energy stage unavailable'; end if;
  insert into public.opportunities(tenant_id,pipeline_id,stage_id,contact_id,title,
    acquisition_source,metadata,next_action)
  values(v_tenant,v_pipeline,v_stage,v_contact,'Solicitud web · '||v_name,'web',
    pg_catalog.jsonb_build_object('request_id',p_request_id,'kind','quote_request','utm',coalesce(p_utm,'{}'::jsonb)),
    'Revisar necesidad y preparar precio aprobado')
  returning id into v_opportunity;
  v_number='FP-WEB-'||to_char(now(),'YYYYMMDD')||'-'||left(replace(p_request_id::text,'-',''),12);
  insert into public.quotations(tenant_id,quote_number,contact_id,opportunity_id,status,
     notes,metadata)
  values(v_tenant,v_number,v_contact,v_opportunity,'draft',
    left(btrim(p_note),1500),
    pg_catalog.jsonb_build_object('request_only',true,'pricing_status','not_approved',
      'zone',left(coalesce(p_location,''),80),'utm',coalesce(p_utm,'{}'::jsonb)))
  returning id into v_quote;
  for v_item in select value from pg_catalog.jsonb_array_elements(p_items)
  loop
    v_service=left(btrim(coalesce(v_item->>'description','')),160);
    if length(v_service)<2 or (v_item->>'quantity')!~'^[0-9]{1,3}$' then
      raise exception 'Invalid quotation line' using errcode='22023';
    end if;
    v_qty=(v_item->>'quantity')::integer;
    if v_qty not between 1 and 100 then
      raise exception 'Invalid quantity' using errcode='22023';
    end if;
    v_position=v_position+1;
    insert into public.quotation_items(tenant_id,quotation_id,position,description,quantity,unit_price)
    values(v_tenant,v_quote,v_position,v_service,v_qty,0);
  end loop;
  select id into v_channel from public.channels
   where tenant_id=v_tenant and provider='webchat' limit 1;
  if v_channel is null then
    insert into public.channels(tenant_id,provider,name,status,settings)
    values(v_tenant,'webchat','Chat web Family Power','connected','{}'::jsonb)
    returning id into v_channel;
  end if;
  insert into public.conversations(tenant_id,channel_id,contact_id,opportunity_id,
    subject,last_message_at,unread_count,metadata)
  values(v_tenant,v_channel,v_contact,v_opportunity,'Solicitud de cotización',now(),1,
   pg_catalog.jsonb_build_object('origin','website','quote_id',v_quote))
  returning id into v_conversation;
  insert into public.messages(tenant_id,conversation_id,direction,sender_type,
    sender_contact_id,message_type,body,status,metadata)
  values(v_tenant,v_conversation,'inbound','contact',v_contact,'text',
   left('Solicitud web: '||p_note,1550),'received',
   pg_catalog.jsonb_build_object('source','website','request_id',p_request_id));
  insert into public.family_power_web_requests(tenant_id,request_id,rate_hash,
      contact_id,opportunity_id,quotation_id,conversation_id)
   values(v_tenant,p_request_id,p_rate_hash,v_contact,v_opportunity,v_quote,v_conversation);
  return pg_catalog.jsonb_build_object('ok',true,'request_id',p_request_id,
    'quotation_id',v_quote,'opportunity_id',v_opportunity,'conversation_id',v_conversation,'duplicate',false);
end;
$$;
revoke all on function public.family_power_web_capture_quote(uuid,text,text,jsonb,text,text,boolean,text,jsonb)
 from public,anon,authenticated;
grant execute on function public.family_power_web_capture_quote(uuid,text,text,jsonb,text,text,boolean,text,jsonb) to service_role;

create or replace function public.family_power_web_chat_message(
 p_token_hash text,p_rate_hash text,p_text text
) returns jsonb language plpgsql security invoker set search_path=''
as $$
declare v_tenant uuid;v_channel uuid;v_conversation uuid;v_existing record;v_message uuid;
begin
 if current_user <> 'service_role' then raise exception 'Forbidden' using errcode='42501'; end if;
 if p_token_hash !~ '^[a-f0-9]{64}$' or p_rate_hash !~ '^[a-f0-9]{64}$'
    or length(btrim(coalesce(p_text,''))) not between 1 and 900
 then raise exception 'Invalid message' using errcode='22023'; end if;
 select id into v_tenant from public.tenants where slug='family-power' and status='active';
 if v_tenant is null then raise exception 'Company unavailable'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_tenant::text||':'||p_token_hash,0));
 select * into v_existing from public.family_power_web_sessions
   where tenant_id=v_tenant and token_hash=p_token_hash and expires_at>now();
 if found then v_conversation=v_existing.conversation_id;
 else
   perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_tenant::text||':'||p_rate_hash,0));
   if(select count(*) from public.family_power_web_sessions
        where tenant_id=v_tenant and rate_hash=p_rate_hash and created_at>now()-interval '1 hour')>=5
   then raise exception 'Too many sessions' using errcode='P0001'; end if;
   select id into v_channel from public.channels where tenant_id=v_tenant and provider='webchat' limit 1;
   if v_channel is null then
     insert into public.channels(tenant_id,provider,name,status,settings)
     values(v_tenant,'webchat','Chat web Family Power','connected','{}'::jsonb)
     returning id into v_channel;
   end if;
   insert into public.conversations(tenant_id,channel_id,subject,status,metadata)
   values(v_tenant,v_channel,'Consulta desde la web','open',
      pg_catalog.jsonb_build_object('origin','website','identity','unverified'))
   returning id into v_conversation;
   insert into public.family_power_web_sessions(tenant_id,token_hash,rate_hash,conversation_id)
   values(v_tenant,p_token_hash,p_rate_hash,v_conversation);
 end if;
 if(select count(*) from public.messages
     where tenant_id=v_tenant and conversation_id=v_conversation
       and created_at>now()-interval '1 hour' and sender_type='contact')>=25 then
   raise exception 'Message rate limited' using errcode='P0001'; end if;
 insert into public.messages(tenant_id,conversation_id,direction,sender_type,
    message_type,body,status,metadata)
 values(v_tenant,v_conversation,'inbound','contact','text',left(btrim(p_text),900),'received',
    pg_catalog.jsonb_build_object('origin','website','identity','unverified'))
 returning id into v_message;
 update public.conversations
   set last_message_at=now(),unread_count=unread_count+1
   where tenant_id=v_tenant and id=v_conversation;
 return pg_catalog.jsonb_build_object('ok',true,'conversation_id',v_conversation,'message_id',v_message,'delivery','received_by_crm');
end;
$$;
revoke all on function public.family_power_web_chat_message(text,text,text) from public,anon,authenticated;
grant execute on function public.family_power_web_chat_message(text,text,text) to service_role;

create or replace function public.family_power_web_chat_history(p_token_hash text)
returns jsonb language plpgsql security invoker set search_path=''
as $$
declare v_tenant uuid;v_conversation uuid;
begin
 if current_user <> 'service_role' then raise exception 'Forbidden' using errcode='42501'; end if;
 if p_token_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid token' using errcode='22023'; end if;
 select id into v_tenant from public.tenants where slug='family-power' and status='active';
 select conversation_id into v_conversation from public.family_power_web_sessions
  where tenant_id=v_tenant and token_hash=p_token_hash and expires_at>now();
 if v_conversation is null then return pg_catalog.jsonb_build_object('ok',false,'error','expired'); end if;
 return pg_catalog.jsonb_build_object('ok',true,'messages',
  coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id',m.id,'body',m.body,'direction',m.direction,'created_at',m.created_at
      ) order by m.created_at)
   from (select id,body,direction,created_at from public.messages
    where tenant_id=v_tenant and conversation_id=v_conversation
      and direction in ('inbound','outbound') and message_type='text'
      and (direction='inbound' or status in ('sent','delivered','read'))
    order by created_at desc limit 40) m),'[]'::jsonb));
end;
$$;
revoke all on function public.family_power_web_chat_history(text) from public,anon,authenticated;
grant execute on function public.family_power_web_chat_history(text) to service_role;
