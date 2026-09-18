-- Entry paths (v2.8, section 4): saved column mappings for Seller Center
-- exports, a log of what last fed the ledger, and tags on rows whose date or
-- quantity was assumed at import time.

create table if not exists import_mappings (
  business_id uuid not null references businesses (id) on delete cascade,
  file_type text not null check (file_type in ('orders', 'finance')),
  mapping jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null default auth.uid(),
  primary key (business_id, file_type)
);
alter table import_mappings enable row level security;
create policy "members read import mappings" on import_mappings for select to authenticated using (business_id = current_business_id());
create policy "admin writes import mappings" on import_mappings for insert to authenticated with check (business_id = current_business_id() and is_admin());
create policy "admin updates import mappings" on import_mappings for update to authenticated using (business_id = current_business_id() and is_admin()) with check (business_id = current_business_id() and is_admin());

create table if not exists import_runs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,
  source text not null check (source in ('csv', 'screenshots', 'quick')),
  ran_at timestamptz not null default now(),
  orders integer not null default 0,
  cancellations integer not null default 0,
  payouts integer not null default 0,
  skipped integer not null default 0,
  note text not null default '',
  created_by uuid references auth.users (id) on delete set null default auth.uid()
);
create index if not exists import_runs_business_idx on import_runs (business_id, ran_at desc);
alter table import_runs enable row level security;
create policy "members read import runs" on import_runs for select to authenticated using (business_id = current_business_id());
create policy "members add import runs" on import_runs for insert to authenticated with check (business_id = current_business_id() and created_by = auth.uid());

-- Tags such as date_assumed and qty_inferred, set by imports and cleared once a person confirms.
alter table transactions add column if not exists tags text[] not null default '{}';
create index if not exists transactions_tags_idx on transactions using gin (tags) where deleted_at is null;

-- Any member may confirm an assumed value; the audit trigger records the change.
create or replace function clear_transaction_tag(p_id uuid, p_tag text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  update transactions set tags = array_remove(tags, p_tag)
   where id = p_id and business_id = current_business_id() and deleted_at is null and p_tag = any(tags);
  get diagnostics n = row_count;
  return n > 0;
end;
$$;
revoke all on function clear_transaction_tag(uuid, text) from public;
grant execute on function clear_transaction_tag(uuid, text) to authenticated;
