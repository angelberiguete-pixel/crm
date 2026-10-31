
-- Family Power: audited catalogue and cash-confirmed sales. Staged only.
-- No fake products, account numbers, test purchases, AI requests or Meta sends.
-- All privileged writes go through owner/admin-only RPCs; fail closed.
create table if not exists public.crm_family_product_approvals(
 tenant_id uuid not null references public.tenants(id) on delete cascade,
 product_id uuid not null references public.products(id) on delete cascade,
 photo_file_id uuid not null references public.tenant_files(id),
 technical_file_id uuid not null references public.tenant_files(id),
 approved_price numeric(16,2) not null check(approved_price>0),
 currency text not null,
 approved_by uuid not null references auth.users(id),
 approved_at timestamptz not null default now(),
 primary key(tenant_id,product_id)
);
alter table public.crm_family_product_approvals enable row level security;
revoke all on public.crm_family_product_approvals from public,anon,authenticated;
grant select on public.crm_family_product_approvals to authenticated;
drop policy if exists crm_family_product_approvals_admin_read on public.crm_family_product_approvals;
create policy crm_family_product_approvals_admin_read on public.crm_family_product_approvals
for select to authenticated using (
  private.crm_is_tenant_admin(tenant_id) and private.crm_active_tenant_matches(tenant_id)
);

create table if not exists public.crm_family_payment_receipts(
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.tenants(id) on delete cascade,
 order_id uuid not null references public.orders(id) on delete cascade,
 evidence_file_id uuid not null unique references public.tenant_files(id),
 amount numeric(16,2) not null check(amount>0),
 currency text not null check(length(currency)=3),
 status text not null default 'pending' check(status in ('pending','confirmed','rejected')),
 submitted_by uuid not null references auth.users(id),
 submitted_at timestamptz not null default now(),
 verified_by uuid references auth.users(id),
 verified_at timestamptz,
 bank_reference text,
 check ((status='pending' and verified_by is null and verified_at is null)
     or (status in ('confirmed','rejected') and verified_by is not null and verified_at is not null))
);
create index if not exists crm_family_receipts_order on public.crm_family_payment_receipts(tenant_id,order_id,status);
alter table public.crm_family_payment_receipts enable row level security;
revoke all on public.crm_family_payment_receipts from public,anon,authenticated;
grant select on public.crm_family_payment_receipts to authenticated;
drop policy if exists crm_family_receipts_admin_read on public.crm_family_payment_receipts;
create policy crm_family_receipts_admin_read on public.crm_family_payment_receipts
for select to authenticated using (
  private.crm_is_tenant_admin(tenant_id) and private.crm_active_tenant_matches(tenant_id)
);

-- Outbox is NOT a Pixel/CAPI delivery. It records a verifiable sale to
-- export later, after Meta connection, consent, rate limits and dedup QA.
create table if not exists public.crm_family_purchase_outbox(
 tenant_id uuid not null references public.tenants(id) on delete cascade,
 order_id uuid not null references public.orders(id) on delete cascade,
 event_id text not null,
 amount numeric(16,2) not null check(amount>0),
 currency text not null,
 delivery_state text not null default 'held' check(delivery_state in ('held','ready','sent','failed')),
 created_at timestamptz not null default now(),
 sent_at timestamptz,
 primary key(tenant_id,order_id),
 unique(tenant_id,event_id)
);
alter table public.crm_family_purchase_outbox enable row level security;
revoke all on public.crm_family_purchase_outbox from public,anon,authenticated;
grant select on public.crm_family_purchase_outbox to authenticated;
drop policy if exists crm_family_purchase_outbox_admin_read on public.crm_family_purchase_outbox;
create policy crm_family_purchase_outbox_admin_read on public.crm_family_purchase_outbox
for select to authenticated using (
  private.crm_is_tenant_admin(tenant_id) and private.crm_active_tenant_matches(tenant_id)
);

create or replace function private.crm_family_admin_allowed(p_tenant_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$
 select auth.uid() is not null
    and private.crm_is_tenant_admin(p_tenant_id)
    and private.crm_active_tenant_matches(p_tenant_id)
    and exists(select 1 from public.tenants t where t.id=p_tenant_id and t.slug='family-power' and t.status='active')
$$;
revoke all on function private.crm_family_admin_allowed(uuid) from public,anon,authenticated;

create or replace function public.crm_family_approve_product(
 p_tenant_id uuid,p_product_id uuid,p_photo_file_id uuid,p_technical_file_id uuid
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare p public.products%rowtype;
begin
 if not private.crm_family_admin_allowed(p_tenant_id) then
   raise exception 'Owner/admin of active Family Power required' using errcode='42501';
 end if;
 select * into p from public.products
  where id=p_product_id and tenant_id=p_tenant_id and status='active';
 if not found or p.sale_price<=0 or p.stock_snapshot is null or p.stock_snapshot<=0
   or nullif(btrim(p.name),'') is null or nullif(btrim(p.sku),'') is null
 then raise exception 'Product model, stock and verified positive price required' using errcode='22023'; end if;
 if not exists(select 1 from public.tenant_files f where f.id=p_photo_file_id
   and f.tenant_id=p_tenant_id and f.status='ready'
   and f.mime_type in ('image/jpeg','image/png','image/webp'))
   or not exists(select 1 from public.tenant_files f where f.id=p_technical_file_id
   and f.tenant_id=p_tenant_id and f.status='ready'
   and f.mime_type='application/pdf')
 then raise exception 'Ready private photo and technical PDF required' using errcode='22023'; end if;
 insert into public.crm_family_product_approvals
 (tenant_id,product_id,photo_file_id,technical_file_id,approved_price,currency,approved_by)
 values(p_tenant_id,p_product_id,p_photo_file_id,p_technical_file_id,p.sale_price,p.currency,auth.uid())
 on conflict(tenant_id,product_id) do update set
 photo_file_id=excluded.photo_file_id,technical_file_id=excluded.technical_file_id,
 approved_price=excluded.approved_price,currency=excluded.currency,
 approved_by=excluded.approved_by,approved_at=now();
 insert into public.audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,metadata)
 values(p_tenant_id,auth.uid(),'family_power.catalog_item_approved','product',p_product_id,
        jsonb_build_object('photo_file_id',p_photo_file_id,'technical_file_id',p_technical_file_id,
          'price',p.sale_price,'currency',p.currency));
 return jsonb_build_object('approved',true,'product_id',p_product_id);
end; $$;
revoke all on function public.crm_family_approve_product(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.crm_family_approve_product(uuid,uuid,uuid,uuid) to authenticated;

-- Edits to product identity, price or availability invalidate the approval.
create or replace function private.crm_family_invalidate_product_approval()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
 if old.name is distinct from new.name or old.sku is distinct from new.sku
  or old.sale_price is distinct from new.sale_price or old.currency is distinct from new.currency
  or old.stock_snapshot is distinct from new.stock_snapshot or old.status is distinct from new.status
 then delete from public.crm_family_product_approvals
    where tenant_id=old.tenant_id and product_id=old.id;
 end if;
 return new;
end; $$;
drop trigger if exists crm_family_invalidate_product_approval on public.products;
create trigger crm_family_invalidate_product_approval
after update of name,sku,sale_price,currency,stock_snapshot,status on public.products
for each row execute function private.crm_family_invalidate_product_approval();

create or replace function public.crm_family_submit_receipt(
 p_tenant_id uuid,p_order_id uuid,p_evidence_file_id uuid,p_amount numeric
) returns uuid language plpgsql security definer set search_path=''
as $$
declare v_order public.orders%rowtype; v_id uuid;
begin
 if not private.crm_family_admin_allowed(p_tenant_id) then
  raise exception 'Owner/admin required to register bank evidence' using errcode='42501';
 end if;
 select * into v_order from public.orders where id=p_order_id and tenant_id=p_tenant_id;
 if not found or v_order.total<=0 or v_order.quotation_id is null
    or not exists(select 1 from public.quotations q where q.id=v_order.quotation_id
      and q.tenant_id=p_tenant_id and q.status='accepted')
 then raise exception 'Accepted real quotation and positive order required' using errcode='22023';end if;
 if p_amount is null or p_amount<=0 or p_amount>v_order.total
 then raise exception 'Invalid receipt amount' using errcode='22023';end if;
 if not exists(select 1 from public.tenant_files f where f.id=p_evidence_file_id
    and f.tenant_id=p_tenant_id and f.status='ready'
    and f.mime_type in ('image/jpeg','image/png','image/webp','application/pdf'))
 then raise exception 'Ready private receipt file required' using errcode='22023';end if;
 insert into public.crm_family_payment_receipts(tenant_id,order_id,evidence_file_id,amount,currency,submitted_by)
 values(p_tenant_id,p_order_id,p_evidence_file_id,p_amount,v_order.currency,auth.uid())
 returning id into v_id;
 insert into public.audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,metadata)
 values(p_tenant_id,auth.uid(),'family_power.payment_evidence_submitted','payment_receipt',v_id,
    jsonb_build_object('order_id',p_order_id,'verified',false));
 return v_id;
end; $$;
revoke all on function public.crm_family_submit_receipt(uuid,uuid,uuid,numeric) from public,anon,authenticated;
grant execute on function public.crm_family_submit_receipt(uuid,uuid,uuid,numeric) to authenticated;

create or replace function public.crm_family_verify_receipt(
 p_tenant_id uuid,p_receipt_id uuid,p_confirmed boolean,p_bank_reference text
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_receipt public.crm_family_payment_receipts%rowtype;
 v_order public.orders%rowtype;v_paid numeric;v_won boolean:=false;
begin
 if not private.crm_family_admin_allowed(p_tenant_id) then
  raise exception 'Owner/admin required to verify actual bank payment' using errcode='42501';
 end if;
 select * into v_receipt from public.crm_family_payment_receipts
  where id=p_receipt_id and tenant_id=p_tenant_id;
 if not found then raise exception 'Receipt not found' using errcode='P0002';end if;
 -- Serialize all receipt verifications of a given order.
 select * into v_order from public.orders where id=v_receipt.order_id
  and tenant_id=p_tenant_id for update;
 if not found or v_order.total<=0 then raise exception 'Invalid order' using errcode='22023';end if;
 select * into v_receipt from public.crm_family_payment_receipts
  where id=p_receipt_id and tenant_id=p_tenant_id for update;
 if v_receipt.status<>'pending' then
  raise exception 'Evidence already decided; do not verify twice' using errcode='23505';
 end if;
 if p_confirmed and (p_bank_reference is null or length(btrim(p_bank_reference))<6 or length(p_bank_reference)>160)
 then raise exception 'Actual bank reconciliation reference required' using errcode='22023';end if;
 if p_confirmed and (v_order.quotation_id is null
   or not exists(select 1 from public.quotations q where q.id=v_order.quotation_id
      and q.tenant_id=p_tenant_id and q.status='accepted'))
 then raise exception 'Accepted quotation required' using errcode='22023';end if;
 update public.crm_family_payment_receipts set
   status=case when p_confirmed then 'confirmed' else 'rejected' end,
   verified_by=auth.uid(),verified_at=now(),
   bank_reference=case when p_confirmed then btrim(p_bank_reference) else null end
 where id=p_receipt_id and tenant_id=p_tenant_id;
 select coalesce(sum(amount),0) into v_paid
  from public.crm_family_payment_receipts
 where tenant_id=p_tenant_id and order_id=v_order.id and status='confirmed';
 if v_paid>v_order.total then
   raise exception 'Payment exceeds order total; reconcile before confirming' using errcode='22023';end if;
 update public.orders set amount_paid=v_paid,updated_at=now()
  where id=v_order.id and tenant_id=p_tenant_id;
 if p_confirmed and v_paid>=v_order.total then
    insert into public.crm_family_purchase_outbox(tenant_id,order_id,event_id,amount,currency)
    values(p_tenant_id,v_order.id,'family-power-purchase:'||v_order.id::text,v_order.total,v_order.currency)
    on conflict(tenant_id,order_id) do nothing;
    if v_order.opportunity_id is not null then
     update public.opportunities set status='won',value=v_order.total,
       actual_close_date=current_date,updated_at=now()
      where id=v_order.opportunity_id and tenant_id=p_tenant_id and status='open';
    end if;
    v_won:=true;
 end if;
 insert into public.audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,metadata)
 values(p_tenant_id,auth.uid(),'family_power.payment_evidence_decided','payment_receipt',p_receipt_id,
   jsonb_build_object('order_id',v_order.id,'confirmed',p_confirmed,
     'bank_verified',p_confirmed,'paid_total',v_paid,
     'sale_recorded',v_won,'meta_export','held'));
 return jsonb_build_object('confirmed',p_confirmed,'paid_total',v_paid,
    'order_total',v_order.total,'sale_recorded',v_won,'meta_export_state','held');
end; $$;
revoke all on function public.crm_family_verify_receipt(uuid,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.crm_family_verify_receipt(uuid,uuid,boolean,text) to authenticated;


-- Atomic manual quotation from approved Family Power inventory only. No fake pricing.
-- This procedure is deliberately owner/admin-only during the pilot.
create or replace function public.crm_family_create_quote(
 p_tenant_id uuid,
 p_contact_id uuid,
 p_valid_until date,
 p_notes text,
 p_lines jsonb
) returns uuid language plpgsql security definer set search_path=''
as $$
declare
 v_quote_id uuid:=gen_random_uuid(); v_contact record;
 v_product public.products%rowtype; v_approval record;
 v_line jsonb; v_product_id uuid; v_quantity numeric(14,2);
 v_discount numeric(7,2); v_currency text:=null; v_position integer:=0;
begin
 if not private.crm_family_admin_allowed(p_tenant_id) then
   raise exception 'Family Power owner/admin required' using errcode='42501';
 end if;
 if p_contact_id is null or not exists(
   select 1 from public.contacts where id=p_contact_id and tenant_id=p_tenant_id
 ) then raise exception 'Real customer contact required' using errcode='22023';end if;
 if p_valid_until is not null and (p_valid_until<current_date or p_valid_until>current_date+90)
 then raise exception 'Quotation validity must be within 90 days' using errcode='22023';end if;
 if length(coalesce(p_notes,''))>2000 then raise exception 'Notes too long' using errcode='22023';end if;
 if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) not between 1 and 20
 then raise exception 'One to twenty approved product lines required' using errcode='22023';end if;
 for v_line in select value from jsonb_array_elements(p_lines) as l(value)
 loop
  v_position:=v_position+1;
  if jsonb_typeof(v_line) is distinct from 'object'
    or coalesce(v_line->>'product_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or coalesce(v_line->>'quantity','') !~ '^[0-9]{1,6}(\\.[0-9]{1,2})?$'
    or coalesce(v_line->>'discount_percent','0') !~ '^[0-9]{1,2}(\\.[0-9]{1,2})?$'
  then raise exception 'Invalid product, quantity or discount' using errcode='22023'; end if;
  v_product_id:=(v_line->>'product_id')::uuid;
  v_quantity:=(v_line->>'quantity')::numeric;
  v_discount:=coalesce((v_line->>'discount_percent')::numeric,0);
  if v_quantity<=0 or v_discount<0 or v_discount>25
  then raise exception 'Quantity or discount outside approval limits' using errcode='22023';end if;
  select * into v_product from public.products where tenant_id=p_tenant_id
    and id=v_product_id and status='active' for share;
  if not found or v_product.sale_price<=0 or v_product.stock_snapshot is null
     or v_product.stock_snapshot<v_quantity or nullif(btrim(v_product.name),'') is null
     or nullif(btrim(v_product.sku),'') is null
  then raise exception 'Product unavailable or price not verified' using errcode='22023';end if;
  select a.* into v_approval from public.crm_family_product_approvals a
   where a.tenant_id=p_tenant_id and a.product_id=v_product_id
     and a.approved_price=v_product.sale_price and a.currency=v_product.currency
     and exists(select 1 from public.tenant_files f where f.id=a.photo_file_id
       and f.tenant_id=p_tenant_id and f.status='ready' and f.mime_type in
       ('image/jpeg','image/png','image/webp'))
     and exists(select 1 from public.tenant_files f where f.id=a.technical_file_id
       and f.tenant_id=p_tenant_id and f.status='ready' and f.mime_type='application/pdf');
  if not found then raise exception 'Product photo, technical sheet and price approval required' using errcode='22023';end if;
  if v_currency is null then v_currency:=v_product.currency;
  elsif v_currency<>v_product.currency then
    raise exception 'All line items must use the same currency' using errcode='22023';
  end if;
 end loop;
 insert into public.quotations(
   id,tenant_id,quote_number,contact_id,status,currency,valid_until,notes,
   subtotal,discount_total,tax_total,total,created_by,metadata
 ) values (
   v_quote_id,p_tenant_id,'FP-'||upper(substring(replace(v_quote_id::text,'-','') from 1 for 12)),
   p_contact_id,'draft',v_currency,p_valid_until,nullif(btrim(coalesce(p_notes,'')),''),
   0,0,0,0,auth.uid(),jsonb_build_object('source','verified_family_power_manual')
 );
 v_position:=0;
 for v_line in select value from jsonb_array_elements(p_lines) as l(value) loop
  v_position:=v_position+1;
  v_product_id:=(v_line->>'product_id')::uuid;
  select * into v_product from public.products where tenant_id=p_tenant_id and id=v_product_id;
  insert into public.quotation_items(
     tenant_id,quotation_id,product_id,position,sku_snapshot,description,
     quantity,unit_price,discount_percent,tax_rate
   ) values (
     p_tenant_id,v_quote_id,v_product.id,v_position,v_product.sku,v_product.name,
     (v_line->>'quantity')::numeric,v_product.sale_price,
     coalesce((v_line->>'discount_percent')::numeric,0),coalesce(v_product.tax_rate,0)
   );
 end loop;
 insert into public.audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,metadata)
 values(p_tenant_id,auth.uid(),'family_power.verified_quote_draft_created','quotation',v_quote_id,
  jsonb_build_object('contact_id',p_contact_id,'item_count',v_position,'currency',v_currency));
 return v_quote_id;
end; $$;
revoke all on function public.crm_family_create_quote(uuid,uuid,date,text,jsonb) from public,anon,authenticated;
grant execute on function public.crm_family_create_quote(uuid,uuid,date,text,jsonb) to authenticated;

-- Prevent manually populating amount_paid on Family Power orders without
-- reconciled receipt records. This is defense-in-depth; outbox is still held.
create or replace function private.crm_family_guard_order_payment()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_reconciled numeric;
begin
 if exists(select 1 from public.tenants t where t.id=new.tenant_id and t.slug='family-power') then
   select coalesce(sum(r.amount),0) into v_reconciled
    from public.crm_family_payment_receipts r
    where r.tenant_id=new.tenant_id and r.order_id=new.id and r.status='confirmed';
   if coalesce(new.amount_paid,0)<>v_reconciled then
    raise exception 'Family Power amount_paid must match reconciled receipts' using errcode='42501';
   end if;
   if tg_op='UPDATE' and new.total is distinct from old.total and v_reconciled>0 then
    raise exception 'Paid Family Power order total requires audited adjustment' using errcode='42501';
   end if;
 end if;
 return new;
end; $$;
revoke all on function private.crm_family_guard_order_payment() from public,anon,authenticated;
drop trigger if exists crm_family_guard_order_payment on public.orders;
create trigger crm_family_guard_order_payment
before insert or update of amount_paid,total on public.orders
for each row execute function private.crm_family_guard_order_payment();


-- For this pilot a won opportunity is not a collected sale. A sales win must
-- be backed by the idempotent outbox created after full receipt reconciliation.
create or replace function private.crm_family_guard_opportunity_win()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
 if new.status='won' and (tg_op='INSERT' or old.status is distinct from 'won')
    and exists(select 1 from public.tenants t where t.id=new.tenant_id and t.slug='family-power')
    and not exists(
      select 1 from public.orders o join public.crm_family_purchase_outbox x
        on x.tenant_id=o.tenant_id and x.order_id=o.id
      where o.tenant_id=new.tenant_id and o.opportunity_id=new.id
       and o.total>0 and o.amount_paid>=o.total
    )
 then raise exception 'Family Power sales require full verified payment' using errcode='42501';
 end if;
 return new;
end; $$;
revoke all on function private.crm_family_guard_opportunity_win() from public,anon,authenticated;
drop trigger if exists crm_family_guard_opportunity_win on public.opportunities;
create trigger crm_family_guard_opportunity_win
before insert or update of status on public.opportunities
for each row execute function private.crm_family_guard_opportunity_win();
