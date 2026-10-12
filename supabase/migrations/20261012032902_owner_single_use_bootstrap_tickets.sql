-- Owner activation tickets. Service-role-only one-time claim, no email or public secret.
-- Applied on Supabase 20261012032902. The actual random ticket is not committed.
create table if not exists private.owner_bootstrap_tickets (
 token_sha256 text primary key check(token_sha256 ~ '^[0-9a-f]{64}$'),
 owner_user_id uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null check(expires_at>created_at),
 consumed_at timestamptz
);
alter table private.owner_bootstrap_tickets enable row level security;
revoke all on private.owner_bootstrap_tickets from public,anon,authenticated;
create or replace function public.claim_owner_bootstrap_ticket(p_sha256 text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_owner uuid;
begin
 if p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' then
   raise exception 'Invalid setup code' using errcode='22023';
 end if;
 update private.owner_bootstrap_tickets b
   set consumed_at=now()
 where b.token_sha256=p_sha256 and b.consumed_at is null and b.expires_at>now()
   and exists(select 1 from public.platform_users p
     where p.user_id=b.owner_user_id and p.platform_role='platform_owner' and p.status='active')
 returning b.owner_user_id into v_owner;
 if v_owner is null then
   raise exception 'Invalid or expired setup code' using errcode='22023';
 end if;
 return v_owner;
end $$;
revoke all on function public.claim_owner_bootstrap_ticket(text) from public,anon,authenticated;
grant execute on function public.claim_owner_bootstrap_ticket(text) to service_role;
