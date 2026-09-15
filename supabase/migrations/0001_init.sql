-- MikiSai Accounting v1 schema
-- Every domain table carries business_id so a second business can be added
-- later without a migration. One business row is seeded at the bottom.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type transaction_type as enum ('income', 'expense');
create type platform as enum ('tiktok', 'shopee', 'fb', 'other');
create type product_line as enum ('sugar', 'skincare', 'other');
create type person as enum ('mike', 'sai');
create type expense_category as enum ('product_cost', 'packaging', 'shipping', 'ads', 'registration', 'other');
create type settlement_status as enum ('pending', 'settled_not_withdrawn', 'received_in_bank');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  business_id uuid not null references businesses (id) on delete cascade,
  display_name text not null check (display_name in ('Mike', 'Sai')),
  created_at timestamptz not null default now()
);
create index profiles_business_id_idx on profiles (business_id);

create table transactions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,
  type transaction_type not null,
  date date not null,
  platform platform not null default 'other',
  product_line product_line not null default 'other',
  gross_amount numeric(12, 2) not null check (gross_amount >= 0),
  net_amount numeric(12, 2) not null check (net_amount >= 0),
  payer person null,
  received_by person null,
  category expense_category null,
  customer_name text null,
  note text not null default '',
  created_at timestamptz not null default now(),
  constraint transactions_person_by_type check (
    (type = 'income' and received_by is not null and payer is null)
    or (type = 'expense' and payer is not null and received_by is null)
  ),
  constraint transactions_category_by_type check (
    (type = 'expense' and category is not null) or (type = 'income' and category is null)
  )
);
create index transactions_business_id_idx on transactions (business_id);
create index transactions_business_date_idx on transactions (business_id, date desc);

create table payouts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,
  date date not null,
  platform platform not null,
  amount_received numeric(12, 2) not null check (amount_received >= 0),
  received_by person not null,
  note text not null default '',
  created_at timestamptz not null default now()
);
create index payouts_business_id_idx on payouts (business_id);

create table settlements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,
  transaction_id uuid not null unique references transactions (id) on delete cascade,
  status settlement_status not null default 'pending',
  settled_at timestamptz null,
  payout_id uuid null references payouts (id) on delete set null,
  created_at timestamptz not null default now()
);
create index settlements_business_id_idx on settlements (business_id);
create index settlements_business_status_idx on settlements (business_id, status);
create index settlements_payout_id_idx on settlements (payout_id);

create table internal_transfers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,
  date date not null,
  from_person person not null,
  to_person person not null,
  amount numeric(12, 2) not null check (amount > 0),
  note text not null default '',
  created_at timestamptz not null default now(),
  constraint internal_transfers_distinct_people check (from_person <> to_person)
);
create index internal_transfers_business_id_idx on internal_transfers (business_id);

create table customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,
  name text not null,
  platform platform not null default 'other',
  note text not null default '',
  created_at timestamptz not null default now()
);
create index customers_business_id_idx on customers (business_id);
create unique index customers_business_name_key on customers (business_id, lower(name));

create table platform_settings (
  business_id uuid not null references businesses (id) on delete cascade,
  platform platform not null,
  commission_pct numeric(5, 2) not null default 0 check (commission_pct >= 0 and commission_pct <= 100),
  fixed_fee numeric(12, 2) not null default 0 check (fixed_fee >= 0),
  primary key (business_id, platform)
);
create index platform_settings_business_id_idx on platform_settings (business_id);

create table report_uploads (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,
  platform platform not null,
  file_url text not null,
  uploaded_at timestamptz not null default now(),
  parsed boolean not null default false,
  parse_result jsonb null
);
create index report_uploads_business_id_idx on report_uploads (business_id);

-- ---------------------------------------------------------------------------
-- Customer auto-insert: first unseen customer_name creates a customers row
-- ---------------------------------------------------------------------------
create or replace function ensure_customer_exists()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.type = 'income' and new.customer_name is not null and btrim(new.customer_name) <> '' then
    insert into customers (business_id, name, platform)
    values (new.business_id, btrim(new.customer_name), new.platform)
    on conflict (business_id, lower(name)) do nothing;
  end if;
  return new;
end;
$$;

create trigger transactions_ensure_customer
  after insert or update of customer_name on transactions
  for each row execute function ensure_customer_exists();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
create or replace function current_business_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select business_id from profiles where id = auth.uid();
$$;

revoke all on function current_business_id() from public;
grant execute on function current_business_id() to authenticated;

alter table businesses enable row level security;
alter table profiles enable row level security;
alter table transactions enable row level security;
alter table settlements enable row level security;
alter table payouts enable row level security;
alter table internal_transfers enable row level security;
alter table customers enable row level security;
alter table platform_settings enable row level security;
alter table report_uploads enable row level security;

create policy "members read their business" on businesses
  for select to authenticated using (id = current_business_id());

create policy "members read business profiles" on profiles
  for select to authenticated using (business_id = current_business_id());

create policy "members manage transactions" on transactions
  for all to authenticated
  using (business_id = current_business_id())
  with check (business_id = current_business_id());

create policy "members manage settlements" on settlements
  for all to authenticated
  using (business_id = current_business_id())
  with check (business_id = current_business_id());

create policy "members manage payouts" on payouts
  for all to authenticated
  using (business_id = current_business_id())
  with check (business_id = current_business_id());

create policy "members manage internal transfers" on internal_transfers
  for all to authenticated
  using (business_id = current_business_id())
  with check (business_id = current_business_id());

create policy "members manage customers" on customers
  for all to authenticated
  using (business_id = current_business_id())
  with check (business_id = current_business_id());

create policy "members manage platform settings" on platform_settings
  for all to authenticated
  using (business_id = current_business_id())
  with check (business_id = current_business_id());

create policy "members manage report uploads" on report_uploads
  for all to authenticated
  using (business_id = current_business_id())
  with check (business_id = current_business_id());

-- ---------------------------------------------------------------------------
-- Storage: private bucket for original report files, path = <business_id>/<file>
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('reports', 'reports', false)
on conflict (id) do nothing;

create policy "members read their report files" on storage.objects
  for select to authenticated
  using (bucket_id = 'reports' and (storage.foldername(name))[1] = current_business_id()::text);

-- ---------------------------------------------------------------------------
-- Seed: the single business and default platform settings
-- ---------------------------------------------------------------------------
insert into businesses (id, name)
values ('00000000-0000-4000-8000-000000000001', 'MikiSai');

insert into platform_settings (business_id, platform, commission_pct, fixed_fee)
values
  ('00000000-0000-4000-8000-000000000001', 'tiktok', 8.00, 0),
  ('00000000-0000-4000-8000-000000000001', 'shopee', 8.00, 0),
  ('00000000-0000-4000-8000-000000000001', 'fb', 0, 0),
  ('00000000-0000-4000-8000-000000000001', 'other', 0, 0);
