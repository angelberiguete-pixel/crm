-- Prevent retroactive price/plan changes for live or sold Empresia offerings.
create or replace function public.empresia_lock_offer_price()
returns trigger language plpgsql set search_path=''
as $$
begin
 if old.status='published'
   or exists(select 1 from public.empresia_checkout_orders o where o.offer_id=old.id) then
   if new.usd_price_cents is distinct from old.usd_price_cents
     or new.kind is distinct from old.kind
     or new.paypal_plan_id is distinct from old.paypal_plan_id
     or new.fulfillment is distinct from old.fulfillment
     or new.slug is distinct from old.slug then
     raise exception 'A published or purchased offer cannot change its payment terms. Create a new offer instead.';
   end if;
 end if;
 return new;
end $$;
drop trigger if exists empresia_lock_offer_price_trigger on public.empresia_offers;
create trigger empresia_lock_offer_price_trigger before update on public.empresia_offers
for each row execute function public.empresia_lock_offer_price();

-- Avoid duplicate recurring approvals for the same buyer and offer.
create unique index if not exists empresia_one_unfinished_subscription_per_buyer
 on public.empresia_checkout_orders(buyer_id,offer_id)
 where kind='monthly' and status in ('created','awaiting_approval','active','paid');
