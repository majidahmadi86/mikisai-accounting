-- MikiSai Accounting v2
--   1. audit_log: immutable record of every mutation, written server side
--   2. indexes for the ledger and settlement queries the dashboard, reports and insights run
--   3. transactions.quantity so insights can reason about units

-- ---------------------------------------------------------------------------
-- 1. Audit log
-- ---------------------------------------------------------------------------
create type audit_action as enum ('create', 'update', 'delete', 'confirm_import', 'confirm_payout', 'export');

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,
  actor_user_id uuid not null references auth.users (id) on delete set null,
  action audit_action not null,
  entity_type text not null,
  entity_id text null,
  before jsonb null,
  after jsonb null,
  created_at timestamptz not null default now()
);
create index audit_log_business_created_idx on audit_log (business_id, created_at desc);
create index audit_log_business_actor_idx on audit_log (business_id, actor_user_id);
create index audit_log_business_entity_idx on audit_log (business_id, entity_type, entity_id);

alter table audit_log enable row level security;

-- Members can read and append. There is deliberately no update or delete policy:
-- once written, an audit row cannot be changed through the API.
create policy "members read audit log" on audit_log
  for select to authenticated using (business_id = current_business_id());

create policy "members append audit log" on audit_log
  for insert to authenticated with check (business_id = current_business_id() and actor_user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 2. Indexes
-- ---------------------------------------------------------------------------
-- (business_id, date desc) already exists from 0001 as transactions_business_date_idx.
create index if not exists transactions_business_type_idx on transactions (business_id, type);
create index if not exists transactions_business_type_date_idx on transactions (business_id, type, date desc);
create index if not exists settlements_status_idx on settlements (status);
create index if not exists payouts_business_date_idx on payouts (business_id, date desc);
create index if not exists internal_transfers_business_date_idx on internal_transfers (business_id, date desc);

-- ---------------------------------------------------------------------------
-- 3. Units per transaction (defaults to 1 so existing rows keep working)
-- ---------------------------------------------------------------------------
alter table transactions add column quantity integer not null default 1 check (quantity > 0);
