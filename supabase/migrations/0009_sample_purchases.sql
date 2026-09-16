-- Samples bought for giving away: an expense in the Samples category whose lines
-- carry a cost per unit now brings those units in at that cost and takes them
-- out again in the same act. Stock is unchanged, the cash is the marketing
-- expense once, and the sample movement carries the real cost. A Samples line
-- without a cost per unit still takes the unit from existing stock at the
-- average, so the sample's cost is the stock written down and nothing more.

create or replace function replace_transaction_items(p_transaction_id uuid, p_items jsonb, p_effect stock_effect)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  tx transactions%rowtype;
  item jsonb;
  n integer := 0;
  movement_kind stock_movement_kind;
  sign numeric;
  item_cost numeric;
begin
  select * into tx from transactions where id = p_transaction_id and business_id = current_business_id() and deleted_at is null;
  if not found then
    raise exception 'transaction not found';
  end if;
  if not (is_admin() or (tx.created_by = auth.uid() and tx.created_at > now() - interval '24 hours')) then
    raise exception 'not allowed';
  end if;

  delete from stock_movements where transaction_id = p_transaction_id;
  delete from transaction_items where transaction_id = p_transaction_id;

  if tx.type = 'income' then
    movement_kind := 'sale'; sign := -1;
  elsif p_effect = 'purchase' then
    movement_kind := 'purchase'; sign := 1;
  elsif p_effect = 'sample' then
    movement_kind := 'sample'; sign := -1;
  else
    movement_kind := null;
  end if;

  for item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    if (item->>'qty')::numeric <= 0 then
      raise exception 'qty must be positive';
    end if;
    if not exists (select 1 from products where id = (item->>'product_id')::uuid and business_id = tx.business_id and deleted_at is null) then
      raise exception 'unknown product';
    end if;
    item_cost := (item->>'unit_cost')::numeric;
    insert into transaction_items (business_id, transaction_id, product_id, qty, unit_price, unit_cost, created_by)
    values (tx.business_id, tx.id, (item->>'product_id')::uuid, (item->>'qty')::numeric, coalesce((item->>'unit_price')::numeric, 0), item_cost, auth.uid());
    if movement_kind = 'sample' and item_cost is not null and item_cost > 0 then
      -- Bought for sampling: in at the price paid, then out below.
      insert into stock_movements (business_id, product_id, qty, kind, unit_cost, transaction_id, date, note, created_by)
      values (tx.business_id, (item->>'product_id')::uuid, (item->>'qty')::numeric, 'purchase', item_cost, tx.id, tx.date, coalesce(tx.note, ''), auth.uid());
    end if;
    if movement_kind is not null then
      insert into stock_movements (business_id, product_id, qty, kind, unit_cost, transaction_id, date, note, created_by)
      values (tx.business_id, (item->>'product_id')::uuid, sign * (item->>'qty')::numeric, movement_kind, case when movement_kind = 'purchase' then item_cost else null end, tx.id, tx.date, coalesce(tx.note, ''), auth.uid());
    end if;
    n := n + 1;
  end loop;

  update transactions set quantity = greatest(1, coalesce((select sum(qty) from transaction_items where transaction_id = tx.id), 1)::integer) where id = tx.id;
  return n;
end;
$$;

-- Backfill: existing Samples lines that carried a cost per unit get their paired purchase movement.
insert into stock_movements (business_id, product_id, qty, kind, unit_cost, transaction_id, date, note, created_by)
select m.business_id, m.product_id, -m.qty, 'purchase', i.unit_cost, m.transaction_id, m.date, m.note, m.created_by
from stock_movements m
join transaction_items i on i.transaction_id = m.transaction_id and i.product_id = m.product_id
where m.kind = 'sample' and i.unit_cost is not null and i.unit_cost > 0
  and not exists (select 1 from stock_movements p where p.transaction_id = m.transaction_id and p.product_id = m.product_id and p.kind = 'purchase');
