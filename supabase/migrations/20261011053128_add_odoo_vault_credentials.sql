create or replace function public.store_erp_connection_credential(p_connection_id uuid,p_secret text)
returns text
language plpgsql
security definer
set search_path=''
as $$
declare
  v_ref text;
  v_secret_id uuid;
  v_tenant uuid;
begin
  if current_user not in ('service_role','postgres') then
    raise exception 'Service role required';
  end if;
  if length(coalesce(p_secret,'')) < 8 then
    raise exception 'Credential is too short';
  end if;

  select tenant_id,credential_ref into v_tenant,v_ref
  from public.erp_connections
  where id=p_connection_id
  for update;

  if v_tenant is null then raise exception 'ERP connection not found'; end if;

  if v_ref like 'vault:%' then
    begin
      v_secret_id := substring(v_ref from 7)::uuid;
    exception when others then
      v_secret_id := null;
    end;
  end if;

  if v_secret_id is not null and exists(select 1 from vault.secrets where id=v_secret_id) then
    perform vault.update_secret(v_secret_id,p_secret,null,'Odoo API key for Look Social Media CRM tenant',null);
  else
    v_secret_id := vault.create_secret(
      p_secret,
      'odoo_'||replace(p_connection_id::text,'-',''),
      'Odoo API key for Look Social Media CRM tenant',
      null
    );
  end if;

  update public.erp_connections
  set credential_ref='vault:'||v_secret_id::text,
      auth_mode='api_key',
      updated_at=now(),
      sync_settings=coalesce(sync_settings,'{}'::jsonb)
        || jsonb_build_object('credential_storage','vault','credential_rotated_at',now())
  where id=p_connection_id;

  return 'vault:'||v_secret_id::text;
end;
$$;

create or replace function public.resolve_erp_connection_credential(p_connection_id uuid)
returns text
language plpgsql
security definer
set search_path=''
as $$
declare
  v_ref text;
  v_secret_id uuid;
  v_secret text;
begin
  if current_user not in ('service_role','postgres') then
    raise exception 'Service role required';
  end if;

  select credential_ref into v_ref
  from public.erp_connections
  where id=p_connection_id;

  if v_ref is null then raise exception 'ERP credential not configured'; end if;
  if v_ref not like 'vault:%' then
    return null;
  end if;

  begin
    v_secret_id := substring(v_ref from 7)::uuid;
  exception when others then
    raise exception 'Invalid vault credential reference';
  end;

  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where id=v_secret_id;

  if v_secret is null then raise exception 'Vault credential not found'; end if;
  return v_secret;
end;
$$;

revoke all on function public.store_erp_connection_credential(uuid,text) from public,anon,authenticated;
revoke all on function public.resolve_erp_connection_credential(uuid) from public,anon,authenticated;
grant execute on function public.store_erp_connection_credential(uuid,text) to service_role;
grant execute on function public.resolve_erp_connection_credential(uuid) to service_role;

comment on function public.store_erp_connection_credential(uuid,text) is 'Stores or rotates an ERP API key in Supabase Vault. Service role only.';
comment on function public.resolve_erp_connection_credential(uuid) is 'Resolves a Vault-backed ERP credential for server-side workers. Service role only.';
