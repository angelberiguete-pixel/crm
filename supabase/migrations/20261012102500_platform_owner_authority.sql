-- LOOK SOCIAL MEDIA CRM: separar propietario de plataforma, administrador y soporte.
-- Solo platform_owner puede crear o modificar propietarios/administradores.
-- platform_admin conserva la facultad de administrar cuentas de soporte.

create or replace function private.crm_is_platform_owner()
returns boolean language sql stable security definer
set search_path to ''
as $$
  select exists(
    select 1 from public.platform_users pu
    where pu.user_id=auth.uid()
      and pu.platform_role='platform_owner'
      and pu.status='active'
  )
$$;

revoke all on function private.crm_is_platform_owner() from public, anon, authenticated;
grant execute on function private.crm_is_platform_owner() to authenticated;

drop policy if exists platform_users_manage on public.platform_users;

create policy platform_users_insert on public.platform_users
for insert to authenticated
with check (
  private.crm_is_platform_owner()
  or (
    private.crm_is_platform_admin()
    and platform_role='support'
    and user_id <> (select auth.uid())
  )
);

create policy platform_users_update on public.platform_users
for update to authenticated
using (
  private.crm_is_platform_owner()
  or (
    private.crm_is_platform_admin()
    and platform_role='support'
    and user_id <> (select auth.uid())
  )
)
with check (
  private.crm_is_platform_owner()
  or (
    private.crm_is_platform_admin()
    and platform_role='support'
    and user_id <> (select auth.uid())
  )
);

create policy platform_users_delete on public.platform_users
for delete to authenticated
using (
  private.crm_is_platform_owner()
  or (
    private.crm_is_platform_admin()
    and platform_role='support'
    and user_id <> (select auth.uid())
  )
);

-- La identidad de una cuenta no se cambia con UPDATE.
-- No se puede dejar la plataforma sin al menos un propietario activo.
create or replace function private.crm_guard_platform_user_ownership()
returns trigger language plpgsql security definer
set search_path to ''
as $$
declare v_other_active_owners integer;
begin
  if tg_op = 'UPDATE' and (
      new.user_id is distinct from old.user_id
      or new.created_at is distinct from old.created_at
    ) then
    raise exception 'No se puede modificar la identidad de un usuario de plataforma'
      using errcode='42501';
  end if;

  if tg_op in ('UPDATE','DELETE')
     and old.platform_role='platform_owner'
     and old.status='active'
     and (
       tg_op='DELETE'
       or new.platform_role is distinct from 'platform_owner'
       or new.status is distinct from 'active'
     ) then
    perform pg_catalog.pg_advisory_xact_lock(202610121005::bigint);
    select count(*) into v_other_active_owners
    from public.platform_users pu
    where pu.platform_role='platform_owner'
      and pu.status='active'
      and pu.user_id <> old.user_id;
    if v_other_active_owners=0 then
      raise exception 'No se puede desactivar o eliminar el último propietario activo'
        using errcode='42501';
    end if;
  end if;

  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists platform_users_guard_last_owner on public.platform_users;
create trigger platform_users_guard_last_owner
before update or delete on public.platform_users
for each row execute function private.crm_guard_platform_user_ownership();

revoke all on function private.crm_guard_platform_user_ownership() from public, anon, authenticated;
