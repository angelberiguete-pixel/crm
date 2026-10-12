-- Applied on production as 20261012042121_guard_tenant_ownership_and_lifecycle.
-- Do not apply twice as another migration with a different timestamp.

CREATE OR REPLACE FUNCTION private.crm_guard_membership_owner_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_owner uuid;
  v_actor uuid := auth.uid();
  v_old_role text;
begin
  if tg_op = 'UPDATE' then
    v_old_role := old.role;
    if new.id is distinct from old.id
       or new.tenant_id is distinct from old.tenant_id
       or new.user_id is distinct from old.user_id
       or new.created_at is distinct from old.created_at then
      raise exception 'La identidad de la membresía no se puede modificar'
        using errcode = '42501';
    end if;
  end if;

  select t.owner_user_id into v_owner from public.tenants t where t.id = new.tenant_id;
  if v_owner is null then return new; end if;

  if new.role = 'owner'
     and (tg_op = 'INSERT' or v_old_role is distinct from 'owner')
     and new.user_id is distinct from v_owner
     and v_actor is not null
     and v_actor is distinct from v_owner
     and not private.crm_is_platform_admin() then
    raise exception 'Solo el propietario puede conceder el rol propietario'
      using errcode = '42501';
  end if;

  if tg_op = 'UPDATE'
     and v_old_role = 'owner' and new.role is distinct from 'owner'
     and v_actor is not null
     and v_actor is distinct from v_owner
     and not private.crm_is_platform_admin() then
    raise exception 'Solo el propietario puede retirar el rol propietario'
      using errcode = '42501';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.crm_guard_owner_role_binding()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_role_key text;
begin
  if tg_op = 'UPDATE'
     and (new.tenant_id is distinct from old.tenant_id
          or new.user_id is distinct from old.user_id) then
    raise exception 'La identidad de la asignación de rol es inmutable'
      using errcode = '42501';
  end if;
  select tr.role_key into v_role_key from public.tenant_roles tr
  where tr.id = new.role_id and tr.tenant_id = new.tenant_id;
  if v_role_key = 'owner' and not exists (
    select 1 from public.memberships m
    where m.tenant_id = new.tenant_id
      and m.user_id = new.user_id
      and m.role = 'owner'
  ) then
    raise exception 'El rol propietario requiere una membresía propietaria'
      using errcode = '42501';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.crm_guard_tenant_lifecycle()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.id is distinct from old.id then
    raise exception 'El identificador de la empresa es inmutable'
      using errcode = '42501';
  end if;
  if new.status is distinct from old.status
     and auth.uid() is not null
     and not private.crm_is_platform_admin() then
    raise exception 'Solo la plataforma puede cambiar el estado de la empresa'
      using errcode = '42501';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.validate_tenant_owner_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.owner_user_id is distinct from old.owner_user_id then
    if auth.uid() is not null
       and auth.uid() is distinct from old.owner_user_id
       and not private.crm_is_platform_admin() then
      raise exception 'Solo el propietario o la plataforma puede transferir la empresa'
        using errcode = '42501';
    end if;
    if not exists (
      select 1 from public.memberships m
      where m.tenant_id = new.id
        and m.user_id = new.owner_user_id
        and m.role = 'owner'
        and m.status = 'active'
    ) then
      raise exception 'El nuevo propietario requiere una membresía propietaria activa'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists memberships_guard_owner_promotion on public.memberships;
create trigger memberships_guard_owner_promotion before insert or update on public.memberships
for each row execute function private.crm_guard_membership_owner_change();

drop trigger if exists tenants_guard_lifecycle on public.tenants;
create trigger tenants_guard_lifecycle before update on public.tenants
for each row execute function private.crm_guard_tenant_lifecycle();

drop trigger if exists tenant_role_bindings_guard_owner on public.tenant_role_bindings;
create trigger tenant_role_bindings_guard_owner before insert or update on public.tenant_role_bindings
for each row execute function private.crm_guard_owner_role_binding();

revoke all on function private.crm_guard_membership_owner_change() from public, anon, authenticated;
revoke all on function private.crm_guard_tenant_lifecycle() from public, anon, authenticated;
revoke all on function private.crm_guard_owner_role_binding() from public, anon, authenticated;
