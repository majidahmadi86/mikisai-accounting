-- The real TikTok Finance statement (v3.1): what each order really paid and
-- why, the wallet (earnings, withdrawals, early-settlement advances), the
-- period each statement covers, orders from before the business began, and
-- the day the business began.

-- The day MikiSai began. Orders created before it are outside the business.
alter table businesses add column if not exists start_date date not null default '2026-09-15';

-- One TikTok listing can stand for several boxes (the old 20 kg and 30 kg bundles).
alter table tiktok_sku_map add column if not exists multiplier integer not null default 1 check (multiplier between 1 and 100);

insert into tiktok_sku_map (business_id, sku_key, sku_name, product_id, learned, multiplier) values
  ('00000000-0000-4000-8000-000000000001', 'id:1734376099134211076', '1 kg packs x 1', '00000000-0000-4000-8000-0000000000b1', false, 1),
  ('00000000-0000-4000-8000-000000000001', 'id:1734376099134276612', '1 kg packs x 2 (old 20 kg bundle)', '00000000-0000-4000-8000-0000000000b1', false, 2),
  ('00000000-0000-4000-8000-000000000001', 'id:1734376099134342148', '1 kg packs x 3 (old 30 kg bundle)', '00000000-0000-4000-8000-0000000000b1', false, 3)
on conflict (business_id, sku_key) do update set product_id = excluded.product_id, multiplier = excluded.multiplier, sku_name = excluded.sku_name;

-- Each statement file and the days it covers, so missing days can be seen.
create table if not exists tiktok_statements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,
  period_from date not null,
  period_to date not null,
  file_name text not null default '',
  upload_id uuid null,
  order_rows integer not null default 0,
  wallet_rows integer not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  check (period_to >= period_from)
);
create index if not exists tiktok_statements_business_idx on tiktok_statements (business_id, period_from);
alter table tiktok_statements enable row level security;
create policy "members read statements" on tiktok_statements for select to authenticated using (business_id = current_business_id());
create policy "members add statements" on tiktok_statements for insert to authenticated with check (business_id = current_business_id());

-- What the statement says about one order: what TikTok really paid and the
-- fees behind it. kind 'refund' is the loss on a return. One row per order and kind.
create table if not exists order_statements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,
  transaction_id uuid null references transactions (id) on delete set null,
  order_ref text not null,
  kind text not null check (kind in ('order', 'refund')),
  created_date date null,
  settled_date date null,
  settlement_amount numeric(12, 2) not null,
  revenue numeric(12, 2) not null default 0,
  fee_commission numeric(12, 2) not null default 0,
  fee_commerce_growth numeric(12, 2) not null default 0,
  fee_transaction numeric(12, 2) not null default 0,
  fee_seller_shipping numeric(12, 2) not null default 0,
  platform_discount numeric(12, 2) not null default 0,
  chargeable_weight_g integer null,
  boxes integer not null default 1,
  overweight boolean not null default false,
  pre_business boolean not null default false,
  qty_inferred boolean not null default false,
  ledger_net_before numeric(12, 2) null,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (business_id, order_ref, kind)
);
create index if not exists order_statements_settled_idx on order_statements (business_id, settled_date);
create index if not exists order_statements_tx_idx on order_statements (transaction_id);
alter table order_statements enable row level security;
create policy "members read order statements" on order_statements for select to authenticated using (business_id = current_business_id());
create policy "members add order statements" on order_statements for insert to authenticated with check (business_id = current_business_id());
create policy "members update order statements" on order_statements for update to authenticated using (business_id = current_business_id()) with check (business_id = current_business_id());

-- The TikTok wallet: earnings credited, money withdrawn to the bank, and
-- early-settlement advances paid in and taken back. reference is TikTok's own id.
create table if not exists wallet_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,
  kind text not null check (kind in ('earnings', 'withdrawal', 'advance_disbursement', 'advance_recovery')),
  reference text not null,
  event_date date not null,
  amount numeric(12, 2) not null,
  status text not null default '',
  bank_suffix text not null default '',
  received_by text not null default 'sai' check (received_by in ('mike', 'sai')),
  created_at timestamptz not null default now(),
  unique (business_id, kind, reference)
);
create index if not exists wallet_events_business_date_idx on wallet_events (business_id, event_date);
alter table wallet_events enable row level security;
create policy "members read wallet events" on wallet_events for select to authenticated using (business_id = current_business_id());
create policy "members add wallet events" on wallet_events for insert to authenticated with check (business_id = current_business_id());

-- A withdrawal can carry money that is not an order of the business: an
-- advance from TikTok, or orders from before the business began.
alter table payouts add column if not exists non_order_amount numeric(12, 2) not null default 0;

-- The loss on a returned parcel.
insert into expense_categories (id, business_id, name_en, name_th, sort)
values ('00000000-0000-4000-8000-0000000000c9', '00000000-0000-4000-8000-000000000001', 'Return cost', 'ค่าเสียหายจากการคืนสินค้า', 95)
on conflict do nothing;
