-- Prueba transaccional de permisos de roles multi-tenant.
-- Ejecutar mediante conexión administrativa; ningún fixture permanece.
begin;
create temporary table qa_role_ids(k text primary key,id uuid not null default gen_random_uuid());
insert into qa_role_ids(k) values('owner_a'),('admin_a'),('agent_a'),('owner_b'),('tenant_a'),('tenant_b');
grant select on qa_role_ids to authenticated;

insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data)
select id,'qa-role-access-'||id::text||'@example.invalid',
 '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb
from qa_role_ids where k in ('owner_a','admin_a','agent_a','owner_b');

insert into public.tenants(id,name,slug,owner_user_id)
select t.id,'QA Roles '||t.k,'qa-roles-'||replace(t.id::text,'-',''),u.id
from qa_role_ids t join qa_role_ids u on u.k=case t.k
  when 'tenant_a' then 'owner_a' else 'owner_b' end
where t.k in ('tenant_a','tenant_b');

insert into public.tenant_subscriptions(tenant_id,plan_id,status)
select id,(select id from public.plans where code='enterprise' limit 1),'active'
from qa_role_ids where k in ('tenant_a','tenant_b');

insert into public.memberships(tenant_id,user_id,role,status)
select t.id,u.id,case u.k when 'owner_a' then 'owner'
 when 'owner_b' then 'owner' when 'admin_a' then 'admin' else 'agent' end,'active'
from qa_role_ids t join qa_role_ids u on
  (t.k='tenant_a' and u.k in ('owner_a','admin_a','agent_a'))
  or (t.k='tenant_b' and u.k='owner_b');

-- El propietario define expresamente un rol con "all" para comprobar su asignación.
select set_config('request.jwt.claims',
 jsonb_build_object('sub',(select id from qa_role_ids where k='owner_a'),'role','authenticated')::text,true);
set local role authenticated;
insert into public.tenant_roles(tenant_id,role_key,name,description,permissions,is_system)
values((select id from qa_role_ids where k='tenant_a'),'owner_delegated_qa',
 'Privilegios delegados QA','Fixture temporal','{"all":true}'::jsonb,false);
reset role;

-- Administrador: conserva gestión de usuarios, sin capacidad de alterar roles.
select set_config('request.jwt.claims',
 jsonb_build_object('sub',(select id from qa_role_ids where k='admin_a'),'role','authenticated')::text,true);
set local role authenticated;
do $$
declare n integer:=0;
begin
 if private.crm_is_tenant_owner((select id from qa_role_ids where k='tenant_a')) then
   raise exception 'FAIL: admin aparece como propietario';
 end if;
 begin
  update public.tenant_roles
  set permissions=permissions || '{"all":true}'::jsonb
  where tenant_id=(select id from qa_role_ids where k='tenant_a')
    and role_key='admin';
  get diagnostics n=row_count;
 exception when insufficient_privilege then n:=0; end;
 if n<>0 then raise exception 'FAIL: admin modificó privilegios de su rol'; end if;

 begin
  delete from public.tenant_roles
  where tenant_id=(select id from qa_role_ids where k='tenant_a')
    and role_key='viewer';
  get diagnostics n=row_count;
 exception when insufficient_privilege then n:=0; end;
 if n<>0 then raise exception 'FAIL: admin eliminó rol de sistema'; end if;

 begin
  insert into public.tenant_roles(tenant_id,role_key,name,permissions)
  values((select id from qa_role_ids where k='tenant_a'),
   'qa_rogue_owner','Escalación QA','{"all":true}'::jsonb);
  raise exception 'FAIL: admin creó un rol con acceso total';
 exception when insufficient_privilege then null; end;

 begin
  update public.tenant_role_bindings
  set role_id=(select r.id from public.tenant_roles r
     where r.tenant_id=(select id from qa_role_ids where k='tenant_a')
       and r.role_key='owner_delegated_qa')
  where tenant_id=(select id from qa_role_ids where k='tenant_a')
    and user_id=(select id from qa_role_ids where k='agent_a');
  raise exception 'FAIL: admin asignó rol de acceso total';
 exception when insufficient_privilege then null; end;

 begin
  update public.tenant_role_bindings
  set role_id=(select r.id from public.tenant_roles r
     where r.tenant_id=(select id from qa_role_ids where k='tenant_b')
       and r.role_key='viewer')
  where tenant_id=(select id from qa_role_ids where k='tenant_a')
    and user_id=(select id from qa_role_ids where k='agent_a');
  raise exception 'FAIL: admin asignó rol de otra empresa';
 exception when insufficient_privilege then null; end;

 begin
  delete from public.tenant_role_bindings
  where tenant_id=(select id from qa_role_ids where k='tenant_a')
    and user_id=(select id from qa_role_ids where k='owner_a');
  raise exception 'FAIL: admin eliminó el rol del propietario';
 exception when insufficient_privilege then null; end;

 update public.memberships set status='suspended'
 where tenant_id=(select id from qa_role_ids where k='tenant_a')
   and user_id=(select id from qa_role_ids where k='agent_a');
 get diagnostics n=row_count;
 if n<>1 then raise exception 'FAIL: admin no puede suspender al vendedor'; end if;
end $$;
reset role;

-- Propietario: puede definir roles, salvo borrar el rol de sistema.
select set_config('request.jwt.claims',
 jsonb_build_object('sub',(select id from qa_role_ids where k='owner_a'),'role','authenticated')::text,true);
set local role authenticated;
do $$
declare n integer:=0;
begin
 if not private.crm_is_tenant_owner((select id from qa_role_ids where k='tenant_a')) then
   raise exception 'FAIL: el propietario no conserva su autoridad';
 end if;
 update public.tenant_roles
 set permissions=permissions || '{"reports":true}'::jsonb
 where tenant_id=(select id from qa_role_ids where k='tenant_a')
   and role_key='manager';
 get diagnostics n=row_count;
 if n<>1 then raise exception 'FAIL: propietario no pudo editar un rol'; end if;

 begin
  delete from public.tenant_roles
  where tenant_id=(select id from qa_role_ids where k='tenant_a')
    and role_key='owner';
  raise exception 'FAIL: propietario eliminó el rol del sistema';
 exception when insufficient_privilege then null; end;

 begin
  update public.tenant_roles set permissions='{"dashboard":true}'::jsonb
  where tenant_id=(select id from qa_role_ids where k='tenant_a')
    and role_key='owner';
  raise exception 'FAIL: se retiró permiso total del rol propietario';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
