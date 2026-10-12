-- Regresión aislada para la jerarquía de propietario, administrador y soporte.
-- Usar conexión administrativa; BEGIN/ROLLBACK impide conservar usuarios de prueba.
begin;
create temporary table qa_platform_auth(k text primary key,id uuid not null default gen_random_uuid(),email text);
insert into qa_platform_auth(k,email) values
 ('owner','qa-platform-owner-'||gen_random_uuid()::text||'@example.invalid'),
 ('admin','qa-platform-admin-'||gen_random_uuid()::text||'@example.invalid'),
 ('support','qa-platform-support-'||gen_random_uuid()::text||'@example.invalid');
grant select on qa_platform_auth to authenticated;
insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data)
select id,email,'{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb
from qa_platform_auth;
insert into public.platform_users(user_id,platform_role,status)
select id,case when k='owner' then 'platform_owner' else 'platform_admin' end,'active'
from qa_platform_auth where k<>'support';

-- Un administrador no se convierte a propietario ni desactiva al propietario.
select set_config('request.jwt.claims',
 jsonb_build_object('sub',(select id from qa_platform_auth where k='admin'),'role','authenticated')::text,true);
set local role authenticated;
do $$
declare n integer:=0;
begin
 if private.crm_is_platform_owner() then raise exception 'FAIL: admin es propietario'; end if;
 begin
  update public.platform_users set platform_role='platform_owner'
  where user_id=(select id from qa_platform_auth where k='admin');
  get diagnostics n=row_count;
 exception when insufficient_privilege then n:=0; end;
 if n<>0 then raise exception 'FAIL: admin se promovió a propietario'; end if;
 begin
  update public.platform_users set status='suspended'
  where user_id=(select id from qa_platform_auth where k='owner');
  get diagnostics n=row_count;
 exception when insufficient_privilege then n:=0; end;
 if n<>0 then raise exception 'FAIL: admin suspendió propietario'; end if;
end $$;

-- Administración del soporte sin poder convertirlo a superadministrador.
insert into public.platform_users(user_id,platform_role,status)
select id,'support','active' from qa_platform_auth where k='support';
update public.platform_users set status='suspended'
where user_id=(select id from qa_platform_auth where k='support');
do $$
declare n integer:=0;
begin
 if not exists(select 1 from public.platform_users
  where user_id=(select id from qa_platform_auth where k='support')
  and status='suspended') then
   raise exception 'FAIL: admin no pudo gestionar soporte';
 end if;
 begin
   update public.platform_users set platform_role='platform_admin'
   where user_id=(select id from qa_platform_auth where k='support');
   get diagnostics n=row_count;
 exception when insufficient_privilege then n:=0; end;
 if n<>0 then raise exception 'FAIL: admin elevó soporte a administrador'; end if;
end $$;
reset role;

-- Propietario legítimo puede conceder administración a soporte.
select set_config('request.jwt.claims',
 jsonb_build_object('sub',(select id from qa_platform_auth where k='owner'),'role','authenticated')::text,true);
set local role authenticated;
do $$
begin
 if not private.crm_is_platform_owner() then raise exception 'FAIL: owner sin autoridad'; end if;
 update public.platform_users set platform_role='platform_admin',status='active'
 where user_id=(select id from qa_platform_auth where k='support');
 if not exists(select 1 from public.platform_users
  where user_id=(select id from qa_platform_auth where k='support')
   and platform_role='platform_admin' and status='active') then
    raise exception 'FAIL: propietario no pudo gestionar administración';
 end if;
end $$;
reset role;
rollback;
