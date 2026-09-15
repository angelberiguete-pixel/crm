create or replace function private.is_land_sales_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    encode(extensions.digest(lower(coalesce(auth.jwt() ->> 'email','')), 'sha256'), 'hex') = any(array[
      'de28264ea4b7e958e8b857968ec0220b133e8bcd33c1a7d90b54799c1baf5f42',
      '158012855230d0652f82b64502f1f586cb5b877875805efd5ba750cc2952c191'
    ]), false
  )
  or exists (
    select 1 from public.land_sales_profiles p
    where p.auth_user_id = auth.uid() and p.role = 'admin' and p.status = 'active'
  );
$$;

comment on function private.is_land_sales_admin() is
  'Security-definer helper used by RLS policies to avoid recursive policy evaluation on land_sales_profiles.';
