-- Regresión transaccional: permisos de invitaciones y roles comerciales personalizados.
-- Se ejecuta con conexión de QA/administrativa; todos los registros se revierten.
begin;

create temporary table qa_security_people
(k text primary key, id uuid not null default gen_random_uuid(), email text);
insert into qa_security_people(k,email) values
  ('owner','qa-security-owner-'||gen_random_uuid()::text||'@example.invalid'),
  ('invitee','qa-security-guest-'||gen_random_uuid()::text||'@example.invalid'),
  ('agent','qa-security-agent-'||gen_random_uuid()::text||'@example.invalid'),
  ('delivery','qa-security-delivery-'||gen_random_uuid()::text||'@example.invalid'),
  ('tenant',null);
grant select on qa_security_people to authenticated;

insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data)
select id,email,'{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb
from qa_security_people where email is not null;

insert into public.tenants(id,name,slug,owner_user_id)
select t.id,'QA Security Invitations','qa-security-'||replace(t.id::text,'-',''),o.id
from qa_security_people t cross join qa_security_people o
where t.k='tenant' and o.k='owner';

insert into public.tenant_subscriptions(tenant_id,plan_id,status)
select id,(select id from public.plans where code='enterprise' limit 1),'active'
from qa_security_people where k='tenant';

insert into public.memberships(tenant_id,user_id,role,status)
select t.id,o.id,'owner','active' from qa_security_people t cross join qa_security_people o
where t.k='tenant' and o.k='owner';

-- Rol base agent debe mapear a sales, no al perfil de solo lectura.
insert into public.memberships(tenant_id,user_id,role,status)
select t.id,a.id,'agent','active' from qa_security_people t cross join qa_security_people a
where t.k='tenant' and a.k='agent';
do $$
begin
  if not exists (
    select 1 from public.tenant_role_bindings b
    join public.tenant_roles r on r.id=b.role_id
    where b.user_id=(select id from qa_security_people where k='agent')
      and r.role_key='sales'
  ) then raise exception 'FAIL: agente no obtuvo permisos de vendedor'; end if;
end $$;

-- El rol especializado Entregas se conserva al aceptar la membresía.
insert into public.tenant_roles(tenant_id,role_key,name,description,permissions,is_system)
select id,'delivery','Entregas QA','Rol temporal',
  '{"dashboard":true,"deliveries":true}'::jsonb,false
from qa_security_people where k='tenant';

insert into public.memberships(tenant_id,user_id,role,status)
select t.id,d.id,'agent','invited' from qa_security_people t cross join qa_security_people d
where t.k='tenant' and d.k='delivery';

insert into public.tenant_role_bindings(tenant_id,user_id,role_id)
select t.id,d.id,r.id from qa_security_people t cross join qa_security_people d
join public.tenant_roles r on r.tenant_id=t.id and r.role_key='delivery'
where t.k='tenant' and d.k='delivery';

insert into public.tenant_invites(tenant_id,email,role,token_hash,status,expires_at,invited_by)
select t.id,i.email,'viewer',encode(extensions.digest(gen_random_uuid()::text,'sha256'),'hex'),
  'pending',now()+interval '7 days',o.id
from qa_security_people t cross join qa_security_people i cross join qa_security_people o
where t.k='tenant' and i.k='invitee' and o.k='owner';

-- Usuario invitado: SELECT sí, UPDATE no.
select set_config('request.jwt.claims',
  jsonb_build_object('sub',(select id from qa_security_people where k='invitee'),
    'email',(select email from qa_security_people where k='invitee'),
    'role','authenticated')::text,true);
set local role authenticated;
do $$
declare changed_count integer := 0;
begin
  if not exists(select 1 from public.tenant_invites
     where email=(select email from qa_security_people where k='invitee')) then
    raise exception 'FAIL: el invitado no puede consultar su invitación';
  end if;
  begin
    update public.tenant_invites
    set role='admin', expires_at=now()+interval '90 days'
    where email=(select email from qa_security_people where k='invitee');
    get diagnostics changed_count=row_count;
  exception when insufficient_privilege then
    changed_count:=0;
  end;
  if changed_count<>0 then
    raise exception 'FAIL: el invitado pudo elevar su propio rol';
  end if;
end $$;
reset role;

-- La ruta RPC de aceptación debe preservar delivery sin intervención del dueño.
select set_config('request.jwt.claims',
  jsonb_build_object('sub',(select id from qa_security_people where k='delivery'),
    'email',(select email from qa_security_people where k='delivery'),
    'role','authenticated')::text,true);
set local role authenticated;
select public.accept_my_tenant_invites();
do $$
begin
  if not exists (
    select 1 from public.memberships m
    join public.tenant_role_bindings b on b.tenant_id=m.tenant_id and b.user_id=m.user_id
    join public.tenant_roles r on r.id=b.role_id
    where m.user_id=(select id from qa_security_people where k='delivery')
      and m.status='active' and r.role_key='delivery'
  ) then raise exception 'FAIL: activar invitación sobrescribió rol especializado'; end if;
end $$;
reset role;

-- El dueño sí puede revocar su invitación.
select set_config('request.jwt.claims',
  jsonb_build_object('sub',(select id from qa_security_people where k='owner'),
    'email',(select email from qa_security_people where k='owner'),
    'role','authenticated')::text,true);
set local role authenticated;
update public.tenant_invites set status='revoked'
where email=(select email from qa_security_people where k='invitee');
do $$
begin
  if not exists(select 1 from public.tenant_invites
    where email=(select email from qa_security_people where k='invitee')
      and role='viewer' and status='revoked') then
    raise exception 'FAIL: el dueño no puede revocar una invitación';
  end if;
end $$;
reset role;

rollback;
