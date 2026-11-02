-- Family Power: internal task suggestions and human-verified completion.
-- No AI draft sends messages or marks tasks as performed.
create unique index if not exists tasks_family_power_ai_run_once
on public.tasks (tenant_id,(metadata->>'ai_run_id'))
where source='ai' and (metadata->>'origin')='family_power_ai_followup';

create or replace function private.family_power_suggest_task_from_ai()
returns trigger
language plpgsql security invoker set search_path=''
as $$
declare
  v_step text;
  v_title text;
  v_contact uuid;
begin
  if new.status <> 'awaiting_approval'
     or (tg_op='UPDATE' and old.status='awaiting_approval')
     or new.output->'requires_human' is distinct from 'true'::jsonb then
    return new;
  end if;
  if not exists (
    select 1 from public.tenants t where t.id=new.tenant_id and t.slug='family-power'
  ) then return new; end if;

  v_step:=new.output->>'next_step';
  v_title:=case v_step
    when 'solicitar_datos' then 'Solicitar datos pendientes indicados por IA'
    when 'proponer_cita' then 'Revisar seguimiento de cita sugerido por IA'
    when 'transferir_humano' then 'Atender consulta escalada por IA'
    when 'preparar_propuesta' then 'Revisar propuesta comercial sugerida por IA'
    when 'responder' then 'Revisar respuesta pendiente sugerida por IA'
    else null end;
  if v_title is null then return new; end if;

  if new.conversation_id is not null then
    select c.contact_id into v_contact from public.conversations c
    where c.tenant_id=new.tenant_id and c.id=new.conversation_id;
  end if;

  insert into public.tasks (
    tenant_id,contact_id,title,description,status,priority,source,metadata
  ) values (
    new.tenant_id,v_contact,v_title,
    'Sugerencia interna de un agente IA. Revisar el borrador y realizar seguimiento humano autorizado. No se ha enviado ni ejecutado la acción.',
    'todo','normal','ai',
    pg_catalog.jsonb_build_object(
      'origin','family_power_ai_followup',
      'ai_run_id',new.id::text,
      'agent_id',new.agent_id::text,
      'next_step',v_step,
      'requires_human',true,
      'review_required',true
    )
  ) on conflict do nothing;
  return new;
end;
$$;
revoke all on function private.family_power_suggest_task_from_ai()
from public, anon, authenticated;
drop trigger if exists family_power_ai_followup_task on public.ai_agent_runs;
create trigger family_power_ai_followup_task
after insert or update of status,output on public.ai_agent_runs
for each row execute function private.family_power_suggest_task_from_ai();

create or replace function private.family_power_verify_task_completion()
returns trigger
language plpgsql security invoker set search_path=''
as $$
declare
  v_user uuid;
  v_evidence jsonb;
  v_detail text;
begin
  if new.status='done' and old.status is distinct from 'done'
     and exists (select 1 from public.tenants t
       where t.id=new.tenant_id and t.slug='family-power') then
    v_user:=auth.uid();
    v_evidence:=new.metadata->'completion_evidence';
    v_detail:=pg_catalog.btrim(coalesce(v_evidence->>'detail',''));
    if v_user is null or pg_catalog.jsonb_typeof(v_evidence) is distinct from 'object'
       or pg_catalog.length(v_detail)<12 then
      raise exception 'family_power_completion_requires_human_evidence'
        using errcode='23514';
    end if;
    new.completed_at:=pg_catalog.now();
    new.metadata:=pg_catalog.jsonb_set(
      coalesce(new.metadata,'{}'::jsonb),'{completion_evidence}',
      pg_catalog.jsonb_build_object(
        'detail',v_detail,'verified_by',v_user::text,
        'verified_at',new.completed_at,'method','human_confirmation'
      ),true
    );
  end if;
  return new;
end;
$$;
revoke all on function private.family_power_verify_task_completion()
from public, anon, authenticated;
drop trigger if exists family_power_task_completion_guard on public.tasks;
create trigger family_power_task_completion_guard
before update of status,metadata on public.tasks
for each row execute function private.family_power_verify_task_completion();
