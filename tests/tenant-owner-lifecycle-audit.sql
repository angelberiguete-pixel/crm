-- Comprobaciones de estructura que no cambian datos.
-- Prueba funcional transaccional realizada contra Supabase en octubre de 2026.
select t.tgname, t.tgenabled, c.relname as table_name
from pg_trigger t
join pg_class c on c.oid=t.tgrelid
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public'
  and t.tgname in (
    'memberships_guard_owner_promotion',
    'tenants_guard_lifecycle',
    'tenant_role_bindings_guard_owner',
    'tenants_validate_owner_change'
  )
order by t.tgname;
