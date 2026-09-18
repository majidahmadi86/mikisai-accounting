-- Nightly TikTok files (v2.9-CSV): the SKU map shared by the API sync and the
-- file import, payouts that cover an order in parts (70% early, 30% later),
-- what the last import saw, and the admin's note on the API approval.

-- One row per TikTok SKU the app has seen. product_id null means "awaiting
-- mapping": the admin picks the product once and every later row resolves.
create table if not exists tiktok_sku_map (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,
  sku_key text not null,
  sku_name text not null default '',
  product_id uuid null references products (id) on delete set null,
  learned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  unique (business_id, sku_key)
);
alter table tiktok_sku_map enable row level security;
create policy "members read sku map" on tiktok_sku_map for select to authenticated using (business_id = current_business_id());
create policy "members add sku map" on tiktok_sku_map for insert to authenticated with check (business_id = current_business_id());
create policy "members update sku map" on tiktok_sku_map for update to authenticated using (business_id = current_business_id()) with check (business_id = current_business_id());

-- Which payout paid how much of which order. An order can have two rows:
-- TikTok pays part early and the rest later.
create table if not exists payout_allocations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,
  payout_id uuid not null references payouts (id) on delete cascade,
  settlement_id uuid not null references settlements (id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  created_at timestamptz not null default now(),
  unique (payout_id, settlement_id)
);
create index if not exists payout_allocations_payout_idx on payout_allocations (payout_id);
create index if not exists payout_allocations_settlement_idx on payout_allocations (settlement_id);
alter table payout_allocations enable row level security;
create policy "members read payout allocations" on payout_allocations for select to authenticated using (business_id = current_business_id());
create policy "members add payout allocations" on payout_allocations for insert to authenticated with check (business_id = current_business_id());
create policy "members remove payout allocations" on payout_allocations for delete to authenticated using (business_id = current_business_id());

-- What an import saw beyond its counts: files, rows without a status, SKUs it could not place.
alter table import_runs add column if not exists details jsonb not null default '{}'::jsonb;

-- The admin's own note on where the Open API application stands.
create table if not exists tiktok_app_status (
  business_id uuid primary key references businesses (id) on delete cascade,
  approval text not null default 'pending' check (approval in ('pending', 'approved')),
  ticket_date date null,
  note text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
alter table tiktok_app_status enable row level security;
create policy "members read tiktok app status" on tiktok_app_status for select to authenticated using (business_id = current_business_id());
create policy "admin writes tiktok app status" on tiktok_app_status for insert to authenticated with check (business_id = current_business_id() and is_admin());
create policy "admin updates tiktok app status" on tiktok_app_status for update to authenticated using (business_id = current_business_id() and is_admin()) with check (business_id = current_business_id() and is_admin());
