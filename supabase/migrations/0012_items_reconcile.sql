-- Line items must add up to the row: a sale's lines (qty x sale price per unit)
-- equal its gross amount, a stock purchase's lines (qty x cost per unit) equal
-- the expense amount, within five satang. A single line at the rounded
-- derived price always passes. Enforced here so no client can write lines that
-- disagree with the amount they belong to.
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
  line_sum numeric := 0;
  row_total numeric;
  single_qty numeric;
  single_price numeric;
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
      insert into stock_movements (business_id, product_id, qty, kind, unit_cost, transaction_id, date, note, created_by)
      values (tx.business_id, (item->>'product_id')::uuid, (item->>'qty')::numeric, 'purchase', item_cost, tx.id, tx.date, coalesce(tx.note, ''), auth.uid());
    end if;
    if movement_kind is not null then
      insert into stock_movements (business_id, product_id, qty, kind, unit_cost, transaction_id, date, note, created_by)
      values (tx.business_id, (item->>'product_id')::uuid, sign * (item->>'qty')::numeric, movement_kind, case when movement_kind = 'purchase' then item_cost else null end, tx.id, tx.date, coalesce(tx.note, ''), auth.uid());
    end if;
    if tx.type = 'income' then
      line_sum := line_sum + (item->>'qty')::numeric * coalesce((item->>'unit_price')::numeric, 0);
      single_qty := (item->>'qty')::numeric; single_price := coalesce((item->>'unit_price')::numeric, 0);
    elsif p_effect = 'purchase' then
      line_sum := line_sum + (item->>'qty')::numeric * coalesce(item_cost, 0);
      single_qty := (item->>'qty')::numeric; single_price := coalesce(item_cost, 0);
    end if;
    n := n + 1;
  end loop;

  -- The invariant: lines add up to the row.
  if n > 0 and (tx.type = 'income' or p_effect = 'purchase') then
    row_total := case when tx.type = 'income' then tx.gross_amount else tx.net_amount end;
    if abs(round(line_sum, 2) - row_total) > 0.05 and not (n = 1 and round(row_total / single_qty, 2) = round(single_price, 2)) then
      raise exception 'lines do not reconcile: lines % vs row %', round(line_sum, 2), row_total using errcode = 'check_violation';
    end if;
  end if;

  update transactions set quantity = greatest(1, coalesce((select sum(qty) from transaction_items where transaction_id = tx.id), 1)::integer) where id = tx.id;
  return n;
end;
$$;
