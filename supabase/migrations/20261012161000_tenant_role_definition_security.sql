-- Seguridad multi-tenant: solo el propietario define roles; administradores gestionan el equipo.
-- Mantener acceso especial para administradores globales de plataforma.
create or replace function private.crm_is_tenant_owner(p_tenant_id uuid)
returns boolean language sql stable security definer
set search_path to ''
as $function$
  select private.crm_is_platform_admin()
     or (
       private.crm_tenant_is_operational(p_tenant_id)
       and exists (
         select 1
         from public.tenants t
         join public.memberships m
           on m.tenant_id=t.id
          and m.user_id=t.owner_user_id
         where t.id=p_tenant_id
           and t.owner_user_id=auth.uid()
           and m.role='owner'
           and m.status='active'
       )
     );
$function$;

revoke all on function private.crm_is_tenant_owner(uuid) from public, anon, authenticated;
grant execute on function private.crm_is_tenant_owner(uuid) to authenticated;

-- Antes private.crm_is_tenant_admin() autorizaba editar o eliminar cualquier rol,
-- incluido admin/owner: esto permitía añadir {"all":true} al rol de uno mismo.
drop policy if exists tenant_roles_manage on public.tenant_roles;
create policy tenant_roles_manage on public.tenant_roles
for all to authenticated
using (private.crm_is_tenant_owner(tenant_id))
with check (private.crm_is_tenant_owner(tenant_id));

-- IDs, empresa de origen y claves de roles del sistema deben ser inmutables.
-- Los roles predeterminados nunca se eliminan desde una sesión de cliente.
create or replace function private.crm_guard_tenant_role_definition()
returns trigger language plpgsql security definer set search_path to ''
as $function$
begin
  if tg_op='DELETE' then
    if old.is_system and auth.uid() is not null
       and not private.crm_is_platform_admin() then
      raise exception 'No se puede eliminar un rol de sistema'
        using errcode='42501';
    end if;
    return old;
  end if;

  if tg_op='UPDATE' then
    if new.id is distinct from old.id
       or new.tenant_id is distinct from old.tenant_id
       or new.created_at is distinct from old.created_at then
      raise exception 'La identidad del rol es inmutable'
        using errcode='42501';
    end if;
    if old.is_system and
        (new.role_key is distinct from old.role_key
         or new.is_system is distinct from true) then
      raise exception 'La clave de un rol del sistema no se puede alterar'
        using errcode='42501';
    end if;
  end if;

  if new.role_key='owner'
     and (
        new.is_system is distinct from true
        or coalesce(new.permissions->>'all','false') <> 'true'
     ) then
    raise exception 'El rol propietario debe conservar su configuración segura'
      using errcode='42501';
  end if;
  return new;
end;
$function$;

drop trigger if exists tenant_roles_guard_definition on public.tenant_roles;
create trigger tenant_roles_guard_definition
before insert or update or delete on public.tenant_roles
for each row execute function private.crm_guard_tenant_role_definition();

-- Una asignación debe apuntar a un rol de la MISMA empresa y a una membresía
-- existente; ni propietarios ni administradores pueden quedar sin rol por accidente.
-- Si un rol personalizado tiene privilegio total, solo el propietario puede asignarlo.
create or replace function private.crm_guard_owner_role_binding()
returns trigger language plpgsql security definer set search_path to ''
as $function$
declare
  v_role_key text;
  v_permissions jsonb;
  v_member_role text;
begin
  if tg_op='DELETE' then
    select m.role into v_member_role
      from public.memberships m
      where m.tenant_id=old.tenant_id and m.user_id=old.user_id;
    if v_member_role='owner'
       and auth.uid() is not null
       and not private.crm_is_platform_admin() then
      raise exception 'No puede eliminarse el rol del propietario'
        using errcode='42501';
    end if;
    return old;
  end if;

  if tg_op='UPDATE' and
      (new.tenant_id is distinct from old.tenant_id
       or new.user_id is distinct from old.user_id) then
    raise exception 'La identidad de la asignación de rol es inmutable'
      using errcode='42501';
  end if;

  select tr.role_key,tr.permissions into v_role_key,v_permissions
    from public.tenant_roles tr
    where tr.id=new.role_id and tr.tenant_id=new.tenant_id;
  if not found then
    raise exception 'El rol asignado no pertenece a esta empresa'
      using errcode='42501';
  end if;

  select m.role into v_member_role from public.memberships m
    where m.tenant_id=new.tenant_id and m.user_id=new.user_id;
  if not found then
    raise exception 'El usuario no tiene membresía en esta empresa'
      using errcode='42501';
  end if;

  if v_role_key='owner' and v_member_role<>'owner' then
    raise exception 'El rol propietario requiere membresía propietaria'
      using errcode='42501';
  end if;
  if v_member_role='owner' and v_role_key<>'owner' then
    raise exception 'La membresía propietaria requiere el rol propietario'
      using errcode='42501';
  end if;
  if coalesce(v_permissions->>'all','false')='true'
     and v_member_role<>'owner'
     and auth.uid() is not null
     and not private.crm_is_tenant_owner(new.tenant_id) then
    raise exception 'Solo el propietario puede otorgar acceso total'
      using errcode='42501';
  end if;

  return new;
end;
$function$;

drop trigger if exists tenant_role_bindings_guard_owner on public.tenant_role_bindings;
create trigger tenant_role_bindings_guard_owner
before insert or update or delete on public.tenant_role_bindings
for each row execute function private.crm_guard_owner_role_binding();

revoke all on function private.crm_guard_tenant_role_definition() from public, anon, authenticated;
revoke all on function private.crm_guard_owner_role_binding() from public, anon, authenticated;
