-- v3.2: variants are real products, a TikTok cancellation that never shipped
-- is not a sale, and the weekly buy list has a buffer.

-- A bag is a unit of its own.
alter table products drop constraint if exists products_unit_label_check;
alter table products add constraint products_unit_label_check check (unit_label in ('box', 'bag', 'pack', 'piece', 'bottle', 'unit'));

-- The bag: Coconut sugar ตรามะลิ, one 1 kg bag, sold at 69. Its cost is left
-- at 0 until the admin sets it.
insert into products (id, business_id, name, name_th, product_line, variant, short_name, unit_label, default_price, default_cost, stock_mode, active)
values ('00000000-0000-4000-8000-0000000000b6', '00000000-0000-4000-8000-000000000001', 'Coconut sugar ตรามะลิ', 'น้ำตาลมะพร้าว ตรามะลิ', 'sugar', '1 kg bag', '1 kg bag', 'bag', 69, 0, 'buy_to_order', true)
on conflict (id) do nothing;

-- Each TikTok listing to the variant it sells, and how many of it one listing is.
insert into tiktok_sku_map (business_id, sku_key, sku_name, product_id, learned, multiplier) values
  ('00000000-0000-4000-8000-000000000001', 'id:1734376099134211076', '1 kg packs x 1', '00000000-0000-4000-8000-0000000000b1', false, 1),
  ('00000000-0000-4000-8000-000000000001', 'id:1737509267160204292', '500 g packs x 1', '00000000-0000-4000-8000-0000000000b2', false, 1),
  ('00000000-0000-4000-8000-000000000001', 'id:1734376099134342148', '1 kg packs x 3 (old 30 kg bundle)', '00000000-0000-4000-8000-0000000000b1', false, 3),
  ('00000000-0000-4000-8000-000000000001', 'id:1737490537713730564', 'Coconut sugar ตรามะลิ 1 kg bag', '00000000-0000-4000-8000-0000000000b6', false, 1)
on conflict (business_id, sku_key) do update set product_id = excluded.product_id, multiplier = excluded.multiplier, sku_name = excluded.sku_name, learned = false;

-- How many units above the backlog the weekly buy list adds, per variant.
alter table businesses add column if not exists buy_buffer integer not null default 5 check (buy_buffer between 0 and 1000);

-- A TikTok order cancelled before it shipped was never a sale: no revenue,
-- no stock out and no return. It keeps its row, marked, so the ledger shows it.
create or replace function mark_cancelled_before_shipping(p_id uuid, p_date date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  tx transactions%rowtype;
  actor uuid := auth.uid();
begin
  if actor is null and not is_service_role() then
    raise exception 'not signed in';
  end if;
  select * into tx from transactions where id = p_id and (business_id = current_business_id() or is_service_role()) and deleted_at is null for update;
  if not found then
    raise exception 'transaction not found';
  end if;
  if tx.type <> 'income' then
    raise exception 'only a sale can be cancelled';
  end if;
  if exists (select 1 from clawbacks where transaction_id = tx.id and deleted_at is null and status = 'offset') then
    raise exception 'money for this order was already taken back from a payout';
  end if;
  if tx.status = 'cancelled' and 'cancelled_before_shipping' = any(tx.tags) then
    return jsonb_build_object('changed', false);
  end if;
  update stock_movements set deleted_at = now(), deleted_by = coalesce(actor, tx.created_by) where transaction_id = tx.id and deleted_at is null;
  update clawbacks set deleted_at = now(), deleted_by = coalesce(actor, tx.created_by) where transaction_id = tx.id and deleted_at is null;
  update transactions
     set status = 'cancelled',
         status_date = coalesce(p_date, tx.status_date, current_date),
         status_reason = 'Cancelled before shipping',
         refund_amount = tx.net_amount,
         tags = array(select distinct unnest(array_append(tx.tags, 'cancelled_before_shipping')))
   where id = tx.id;
  return jsonb_build_object('changed', true);
end;
$$;
revoke all on function mark_cancelled_before_shipping(uuid, date) from public;
grant execute on function mark_cancelled_before_shipping(uuid, date) to authenticated;

-- Moves a sale's lines from one variant to another (the listing it really was),
-- stock movements with them. Admin only; every row it touches is audited.
create or replace function remap_sale_variant(p_id uuid, p_from uuid, p_to uuid, p_multiplier integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  tx transactions%rowtype;
  moved integer := 0;
begin
  if not is_admin() then
    raise exception 'not allowed';
  end if;
  select * into tx from transactions where id = p_id and business_id = current_business_id() and deleted_at is null for update;
  if not found or tx.type <> 'income' then
    raise exception 'sale not found';
  end if;
  if not exists (select 1 from products where id = p_to and business_id = tx.business_id and deleted_at is null) then
    raise exception 'unknown product';
  end if;
  update transaction_items set product_id = p_to, qty = qty * greatest(1, p_multiplier), unit_price = round(unit_price / greatest(1, p_multiplier), 2)
   where transaction_id = tx.id and product_id = p_from and deleted_at is null;
  get diagnostics moved = row_count;
  update stock_movements set product_id = p_to, qty = qty * greatest(1, p_multiplier)
   where transaction_id = tx.id and product_id = p_from and deleted_at is null;
  if p_multiplier > 1 then
    update transactions set quantity = quantity * p_multiplier where id = tx.id;
  end if;
  return jsonb_build_object('moved', moved);
end;
$$;
revoke all on function remap_sale_variant(uuid, uuid, uuid, integer) from public;
grant execute on function remap_sale_variant(uuid, uuid, uuid, integer) to authenticated;
