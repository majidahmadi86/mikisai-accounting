-- Inventory: products, stock movements and transaction items.
-- Stock is valued at moving average cost (computed in the app from the
-- movement history); this migration only stores facts.

create type stock_movement_kind as enum ('purchase', 'sale', 'sample', 'adjustment', 'return');
create type stock_effect as enum ('none', 'purchase', 'sample');

-- Which expense categories move stock: Stock purchase brings units in at cost, Samples takes them out.
alter table expense_categories add column stock_effect stock_effect not null default 'none';
update expense_categories set stock_effect = 'purchase' where id = '00000000-0000-4000-8000-0000000000c1';
update expense_categories set stock_effect = 'sample' where id = '00000000-0000-4000-8000-0000000000c2';

create table products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  product_line product_line not null default 'other',
  variant text not null default '',
  unit_label text not null default 'box',
  default_cost numeric(12, 2) not null default 0 check (default_cost >= 0),
  default_price numeric(12, 2) not null default 0 check (default_price >= 0),
  low_stock_threshold integer not null default 3 check (low_stock_threshold >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  deleted_at timestamptz null,
  deleted_by uuid references auth.users (id) on delete set null
);
create unique index products_business_name_variant_key on products (business_id, lower(name), lower(variant));
create index products_live_idx on products (business_id) where deleted_at is null;

create table stock_movements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,
  product_id uuid not null references products (id),
  qty numeric(12, 3) not null check (qty <> 0),
  kind stock_movement_kind not null,
  unit_cost numeric(12, 2) null check (unit_cost is null or unit_cost >= 0),
  transaction_id uuid null references transactions (id) on delete cascade,
  date date not null,
  note text not null default '',
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null default auth.uid()
);
create index stock_movements_business_product_idx on stock_movements (business_id, product_id, date, created_at);
create index stock_movements_transaction_idx on stock_movements (transaction_id);

create table transaction_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,
  transaction_id uuid not null references transactions (id) on delete cascade,
  product_id uuid not null references products (id),
  qty numeric(12, 3) not null check (qty > 0),
  unit_price numeric(12, 2) not null default 0 check (unit_price >= 0),
  unit_cost numeric(12, 2) null check (unit_cost is null or unit_cost >= 0),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null default auth.uid()
);
create index transaction_items_transaction_idx on transaction_items (transaction_id);
create index transaction_items_business_product_idx on transaction_items (business_id, product_id);

-- ---------------------------------------------------------------------------
-- RLS: everyone reads; both roles add; contributors edit own rows for 24h,
-- admin edits anything; stock adjustments are admin only; no DELETE anywhere.
-- ---------------------------------------------------------------------------
alter table products enable row level security;
alter table stock_movements enable row level security;
alter table transaction_items enable row level security;

create policy "members read products" on products for select to authenticated using (business_id = current_business_id());
create policy "members add products" on products for insert to authenticated with check (business_id = current_business_id() and created_by = auth.uid() and deleted_at is null);
create policy "role-based update products" on products for update to authenticated
  using (business_id = current_business_id() and (is_admin() or (created_by = auth.uid() and created_at > now() - interval '24 hours')))
  with check (business_id = current_business_id() and (is_admin() or created_by = auth.uid()));

create policy "members read stock movements" on stock_movements for select to authenticated using (business_id = current_business_id());
create policy "members add stock movements" on stock_movements for insert to authenticated
  with check (business_id = current_business_id() and created_by = auth.uid() and (kind <> 'adjustment' or is_admin()));
create policy "admin adjusts stock movements" on stock_movements for update to authenticated
  using (business_id = current_business_id() and is_admin())
  with check (business_id = current_business_id() and is_admin());

create policy "members read transaction items" on transaction_items for select to authenticated using (business_id = current_business_id());
create policy "members add transaction items" on transaction_items for insert to authenticated with check (business_id = current_business_id() and created_by = auth.uid());
create policy "role-based update transaction items" on transaction_items for update to authenticated
  using (business_id = current_business_id() and (is_admin() or (created_by = auth.uid() and created_at > now() - interval '24 hours')))
  with check (business_id = current_business_id() and (is_admin() or created_by = auth.uid()));

create trigger products_audit after insert or update or delete on products for each row execute function audit_row_change('product');
create trigger stock_movements_audit after insert or update or delete on stock_movements for each row execute function audit_row_change('stock_movement');
create trigger transaction_items_audit after insert or update or delete on transaction_items for each row execute function audit_row_change('transaction_item');

-- ---------------------------------------------------------------------------
-- Replacing a transaction's items (and the stock movements they imply) is the
-- one place rows are removed. It runs as a security-definer function with the
-- same rule as editing the transaction itself, so users still have no DELETE
-- policy anywhere and every removed row is still audited by the triggers.
-- ---------------------------------------------------------------------------
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
    insert into transaction_items (business_id, transaction_id, product_id, qty, unit_price, unit_cost, created_by)
    values (tx.business_id, tx.id, (item->>'product_id')::uuid, (item->>'qty')::numeric, coalesce((item->>'unit_price')::numeric, 0), (item->>'unit_cost')::numeric, auth.uid());
    if movement_kind is not null then
      insert into stock_movements (business_id, product_id, qty, kind, unit_cost, transaction_id, date, note, created_by)
      values (tx.business_id, (item->>'product_id')::uuid, sign * (item->>'qty')::numeric, movement_kind, (item->>'unit_cost')::numeric, tx.id, tx.date, coalesce(tx.note, ''), auth.uid());
    end if;
    n := n + 1;
  end loop;

  update transactions set quantity = greatest(1, coalesce((select sum(qty) from transaction_items where transaction_id = tx.id), 1)::integer) where id = tx.id;
  return n;
end;
$$;
revoke all on function replace_transaction_items(uuid, jsonb, stock_effect) from public;
grant execute on function replace_transaction_items(uuid, jsonb, stock_effect) to authenticated;

-- ---------------------------------------------------------------------------
-- Backfill: one product per product line with variant "Unspecified", one item
-- per existing income row (qty from the row) and the matching sale movement.
-- ---------------------------------------------------------------------------
insert into products (id, business_id, name, product_line, variant, unit_label)
values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000001', 'Sugar', 'sugar', 'Unspecified', 'box'),
  ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-000000000001', 'Skincare', 'skincare', 'Unspecified', 'pack'),
  ('00000000-0000-4000-8000-0000000000a3', '00000000-0000-4000-8000-000000000001', 'Other', 'other', 'Unspecified', 'unit');

insert into transaction_items (business_id, transaction_id, product_id, qty, unit_price, created_by)
select t.business_id, t.id,
  case t.product_line when 'sugar' then '00000000-0000-4000-8000-0000000000a1'::uuid when 'skincare' then '00000000-0000-4000-8000-0000000000a2'::uuid else '00000000-0000-4000-8000-0000000000a3'::uuid end,
  greatest(1, t.quantity), round(t.gross_amount / greatest(1, t.quantity), 2), t.created_by
from transactions t
where t.type = 'income' and t.business_id = '00000000-0000-4000-8000-000000000001';

insert into stock_movements (business_id, product_id, qty, kind, transaction_id, date, note, created_by)
select i.business_id, i.product_id, -i.qty, 'sale', i.transaction_id, t.date, t.note, i.created_by
from transaction_items i join transactions t on t.id = i.transaction_id;
