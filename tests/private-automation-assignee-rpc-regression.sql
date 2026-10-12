-- Verificación transaccional: RPC internos privados no son APIs de usuarios.
-- Se generan datos ficticios, se prueban los accesos y se revierten todos.
begin;
create temporary table qa_private_calls(k text primary key,id uuid not null default gen_random_uuid());
insert into qa_private_calls(k) values ('owner'),('outsider'),('tenant');
grant select on qa_private_calls to authenticated;
insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data)
select id,'qa-rpc-'||id::text||'@example.invalid',
  '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb
from qa_private_calls where k in ('owner','outsider');
insert into public.tenants(id,name,slug,owner_user_id)
select t.id,'QA Private RPC','qa-rpc-'||replace(t.id::text,'-',''),o.id
from qa_private_calls t cross join qa_private_calls o
where t.k='tenant' and o.k='owner';
insert into public.tenant_subscriptions(tenant_id,plan_id,status)
select id,(select id from public.plans where code='enterprise' limit 1),'active'
from qa_private_calls where k='tenant';
insert into public.memberships(tenant_id,user_id,role,status)
select t.id,o.id,'owner','active'
from qa_private_calls t cross join qa_private_calls o
where t.k='tenant' and o.k='owner';

-- El usuario ajeno no debe generar eventos ni enumerar miembros de la empresa.
select set_config('request.jwt.claims',jsonb_build_object(
 'sub',(select id from qa_private_calls where k='outsider'),
 'role','authenticated')::text,true);
set local role authenticated;
do $qa$
declare blocked boolean;
begin
  blocked:=false;
  begin
    perform private.enqueue_automation_event(
      (select id from qa_private_calls where k='tenant'),
      'contact_created','contact',gen_random_uuid(),
      '{"qa":"unauthorized"}'::jsonb,null,'test',null);
  exception when insufficient_privilege then blocked:=true;
  end;
  if not blocked then raise exception 'FAIL: inyección externa de evento'; end if;

  blocked:=false;
  begin
    perform private.crm_valid_conversation_assignee(
      (select id from qa_private_calls where k='tenant'),
      (select id from qa_private_calls where k='owner'));
  exception when insufficient_privilege then blocked:=true;
  end;
  if not blocked then raise exception 'FAIL: consulta interna de miembros de otro tenant'; end if;
end $qa$;
reset role;

-- El RPC público autorizado sigue usando el helper internamente.
select set_config('request.jwt.claims',jsonb_build_object(
 'sub',(select id from qa_private_calls where k='owner'),
 'role','authenticated')::text,true);
set local role authenticated;
select public.set_active_tenant((select id from qa_private_calls where k='tenant'));
do $qa$
begin
  if not exists(
    select 1 from public.tenant_inbox_assignees(
      (select id from qa_private_calls where k='tenant')) a
    where a.user_id=(select id from qa_private_calls where k='owner')
  ) then raise exception 'FAIL: el propietario no puede ver sus asignaciones'; end if;
end $qa$;
reset role;

-- Las llamadas internas de los triggers SECURITY DEFINER conservan su capacidad
-- de insertar eventos bajo el propietario de la función, sin exponerla al navegador.
do $qa$
declare evt uuid;
begin
  evt:=private.enqueue_automation_event(
    (select id from qa_private_calls where k='tenant'),
    'contact_created','contact',gen_random_uuid(),
    '{"qa":"internal"}'::jsonb,null,'test',null);
  if evt is null or not exists(
    select 1 from public.automation_events
    where id=evt and tenant_id=(select id from qa_private_calls where k='tenant')
  ) then raise exception 'FAIL: proceso interno no puede generar eventos'; end if;
end $qa$;
rollback;
