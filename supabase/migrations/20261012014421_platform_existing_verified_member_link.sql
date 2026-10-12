-- Supabase migration applied 20261012014421. Verified accounts only; no invitations are emailed.
CREATE OR REPLACE FUNCTION public.platform_link_existing_user(p_tenant_id uuid, p_email text, p_role_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_email text:=lower(btrim(coalesce(p_email,'')));
        v_user_id uuid;
        v_result jsonb;
begin
  if auth.uid() is null or not private.is_platform_admin() then
    raise exception 'Platform Admin requerido' using errcode='42501';
  end if;
  if not exists(select 1 from public.tenants t where t.id=p_tenant_id and t.status='active')
  then raise exception 'Empresa inexistente o inactiva' using errcode='22023'; end if;
  if length(v_email)>254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
  then raise exception 'Correo inválido' using errcode='22023'; end if;
  if p_role_key is null or p_role_key='owner' or not exists(
    select 1 from public.tenant_roles tr where tr.tenant_id=p_tenant_id and tr.role_key=p_role_key
  ) then raise exception 'Rol inexistente o no asignable mediante esta operación' using errcode='22023'; end if;
  select u.id into v_user_id from auth.users u
  where lower(u.email)=v_email and u.email_confirmed_at is not null
  limit 1;
  if v_user_id is null then
    raise exception 'El correo no tiene una cuenta activa y verificada. No se envió ninguna invitación.'
      using errcode='22023';
  end if;
  if exists(select 1 from public.memberships m
     where m.tenant_id=p_tenant_id and m.user_id=v_user_id and m.role='owner')
  then raise exception 'El propietario no se modifica desde el alta de usuarios' using errcode='42501'; end if;
  v_result:=public.platform_add_member(p_tenant_id,v_user_id,p_role_key,'active');
  return jsonb_build_object('tenant_id',p_tenant_id,'user_id',v_user_id,
    'email',v_email,'role_key',p_role_key,'status','active','email_sent',false,
    'result',v_result);
end $function$

revoke all on function public.platform_link_existing_user(uuid,text,text) from public,anon;
grant execute on function public.platform_link_existing_user(uuid,text,text) to authenticated;
