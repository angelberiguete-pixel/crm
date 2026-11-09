-- Applied to main Supabase 20261109111841.
-- PostgreSQL CHECK allows UNKNOWN, so NULL must explicitly evaluate to false.
alter table public.cita24_portal_configs
 drop constraint if exists cita24_privacy_required_for_public;
alter table public.cita24_portal_configs
 add constraint cita24_privacy_required_for_public
 check(enabled = false or coalesce(
   privacy_url ~ '^https://[^[:space:]<>]{6,300}$',
   false
 ));
