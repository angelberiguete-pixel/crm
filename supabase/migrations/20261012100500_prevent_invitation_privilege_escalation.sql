-- LOOK SOCIAL MEDIA CRM — impedir escalación por invitación y respetar roles especializados.
-- 1. Una persona invitada puede leer su invitación, pero no alterar su rol, token, estado o vencimiento.
-- La aceptación legítima sigue ejecutándose mediante los RPC SECURITY DEFINER existentes.
drop policy if exists tenant_invites_update on public.tenant_invites;
create policy tenant_invites_update
on public.tenant_invites
for update
to authenticated
using (private.is_tenant_admin(tenant_id))
with check (private.is_tenant_admin(tenant_id));

-- 2. La activación de una membresía no debe borrar roles personalizados compatibles.
-- El rol básico agent equivale al rol comercial sales, nunca viewer.
create or replace function private.after_membership_bind_role()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_existing_role_key text;
  v_default_role_key text;
  v_default_role_id uuid;
begin
  if new.status <> 'active' then
    return new;
  end if;

  perform private.seed_default_tenant_roles(new.tenant_id);

  select tr.role_key into v_existing_role_key
  from public.tenant_role_bindings b
  join public.tenant_roles tr
    on tr.id=b.role_id and tr.tenant_id=b.tenant_id
  where b.tenant_id=new.tenant_id and b.user_id=new.user_id
  limit 1;

  -- Los roles de Producción, Entregas, Administrador del negocio,
  -- etc. conservan su configuración mientras corresponda al rol base.
  if v_existing_role_key is not null
     and private.membership_role_for_tenant_role(v_existing_role_key)=new.role then
    return new;
  end if;

  v_default_role_key := case
    when new.role in ('owner','admin','manager','viewer') then new.role
    when new.role in ('agent','sales','member') then 'sales'
    else 'viewer'
  end;

  select tr.id into v_default_role_id
  from public.tenant_roles tr
  where tr.tenant_id=new.tenant_id
    and tr.role_key=v_default_role_key
  limit 1;

  if v_default_role_id is null then
    raise exception 'No se encontró el rol de seguridad %', v_default_role_key
      using errcode='23503';
  end if;

  insert into public.tenant_role_bindings(tenant_id,user_id,role_id)
  values(new.tenant_id,new.user_id,v_default_role_id)
  on conflict (tenant_id,user_id)
  do update set role_id=excluded.role_id,updated_at=now();

  return new;
end;
$function$;

-- El helper se ejecuta por trigger, no debe ser API ejecutable por usuarios.
revoke all on function private.after_membership_bind_role() from public, anon, authenticated;
