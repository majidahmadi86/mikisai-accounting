-- TikTok Shop Open API sync (v2.9).
--
-- The shop's tokens live in their own table with row level security on and
-- no policies: only the service role (the sync, the OAuth callback) can read
-- or write them. The businesses row stays readable by both founders, so the
-- secrets do not go there. Every sync writes a sync_log row; orders the sync
-- cannot settle by itself wait in sync_queue for the review table.

create table if not exists tiktok_connections (
  business_id uuid primary key references businesses (id) on delete cascade,
  shop_id text null,
  shop_cipher text null,
  shop_name text null,
  seller_name text null,
  region text null,
  open_id text null,
  access_token_enc text not null,
  refresh_token_enc text not null,
  access_expires_at timestamptz not null,
  refresh_expires_at timestamptz not null,
  status text not null default 'connected' check (status in ('connected', 'expired', 'error', 'disconnected')),
  last_error text not null default '',
  orders_cursor timestamptz null,
  finance_cursor timestamptz null,
  last_sync_at timestamptz null,
  connected_by uuid references auth.users (id) on delete set null,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table tiktok_connections enable row level security;
-- No policies on purpose: service role only.

create table if not exists sync_log (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,
  source text not null default 'tiktok',
  trigger text not null check (trigger in ('cron', 'webhook', 'manual')),
  started_at timestamptz not null default now(),
  finished_at timestamptz null,
  status text not null default 'running' check (status in ('running', 'ok', 'error', 'skipped')),
  orders_new integer not null default 0,
  orders_updated integer not null default 0,
  cancellations integer not null default 0,
  refunds integer not null default 0,
  payouts integer not null default 0,
  queued integer not null default 0,
  error text not null default '',
  details jsonb not null default '{}'::jsonb
);
create index if not exists sync_log_business_idx on sync_log (business_id, started_at desc);
alter table sync_log enable row level security;
create policy "members read sync log" on sync_log for select to authenticated using (business_id = current_business_id());

create table if not exists sync_queue (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,
  platform platform not null default 'tiktok',
  order_ref text not null,
  row jsonb not null,
  reasons text[] not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists sync_queue_pending_key on sync_queue (business_id, platform, order_ref) where status = 'pending';
alter table sync_queue enable row level security;
create policy "members read sync queue" on sync_queue for select to authenticated using (business_id = current_business_id());
create policy "members settle sync queue" on sync_queue for update to authenticated using (business_id = current_business_id()) with check (business_id = current_business_id());

-- Home says which path last fed the ledger; the sync is one more.
alter table import_runs drop constraint if exists import_runs_source_check;
alter table import_runs add constraint import_runs_source_check check (source in ('csv', 'screenshots', 'quick', 'tiktok'));

-- A payout the platform reported carries its payment id so the next sync never records it twice.
alter table payouts add column if not exists external_ref text null;
create unique index if not exists payouts_external_ref_key on payouts (business_id, platform, external_ref) where external_ref is not null and deleted_at is null;

-- The sync runs as the service role (no signed-in user). The two row-writing
-- functions accept it and scope by the row's own business.
create or replace function is_service_role()
returns boolean
language sql
stable
as $$
  select coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') = 'service_role';
$$;

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
  actor uuid := auth.uid();
begin
  select * into tx from transactions where id = p_transaction_id and (business_id = current_business_id() or is_service_role()) and deleted_at is null;
  if not found then
    raise exception 'transaction not found';
  end if;
  if not (is_service_role() or is_admin() or (tx.created_by = auth.uid() and tx.created_at > now() - interval '24 hours')) then
    raise exception 'not allowed';
  end if;
  if actor is null then
    actor := tx.created_by;
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
    values (tx.business_id, tx.id, (item->>'product_id')::uuid, (item->>'qty')::numeric, coalesce((item->>'unit_price')::numeric, 0), item_cost, actor);
    if movement_kind = 'sample' and item_cost is not null and item_cost > 0 then
      insert into stock_movements (business_id, product_id, qty, kind, unit_cost, transaction_id, date, note, created_by)
      values (tx.business_id, (item->>'product_id')::uuid, (item->>'qty')::numeric, 'purchase', item_cost, tx.id, tx.date, coalesce(tx.note, ''), actor);
    end if;
    if movement_kind is not null then
      insert into stock_movements (business_id, product_id, qty, kind, unit_cost, transaction_id, date, note, created_by)
      values (tx.business_id, (item->>'product_id')::uuid, sign * (item->>'qty')::numeric, movement_kind, case when movement_kind = 'purchase' then item_cost else null end, tx.id, tx.date, coalesce(tx.note, ''), actor);
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

create or replace function mark_order_status(p_id uuid, p_status text, p_date date, p_reason text, p_refund numeric, p_unit_cost numeric)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  tx transactions%rowtype;
  s settlements%rowtype;
  refund numeric;
  cash numeric := 0;
  claw numeric := 0;
  line record;
  ret_qty numeric;
  returned numeric := 0;
  claw_id uuid;
  actor uuid := auth.uid();
begin
  if actor is null and not is_service_role() then
    raise exception 'not signed in';
  end if;
  select * into tx from transactions where id = p_id and (business_id = current_business_id() or is_service_role()) and deleted_at is null for update;
  if not found then
    raise exception 'transaction not found';
  end if;
  if actor is null then
    actor := tx.created_by;
  end if;
  if tx.type <> 'income' then
    raise exception 'only a sale can be cancelled or refunded';
  end if;
  if p_status not in ('active', 'cancelled', 'refunded') then
    raise exception 'unknown status %', p_status;
  end if;

  if p_status = 'active' then
    if tx.status = 'active' then
      return jsonb_build_object('changed', false);
    end if;
    if exists (select 1 from clawbacks where transaction_id = tx.id and deleted_at is null and status = 'offset') then
      raise exception 'a clawback for this order was already offset by a payout; it cannot be reinstated';
    end if;
    update stock_movements set deleted_at = now(), deleted_by = actor where transaction_id = tx.id and kind = 'return' and deleted_at is null;
    update clawbacks set deleted_at = now(), deleted_by = actor where transaction_id = tx.id and deleted_at is null;
    update transactions set status = 'active', status_date = null, status_reason = '', refund_amount = null where id = tx.id;
    return jsonb_build_object('changed', true, 'status', 'active');
  end if;

  if tx.status <> 'active' then
    return jsonb_build_object('changed', false, 'status', tx.status);
  end if;
  refund := case when p_status = 'cancelled' then tx.net_amount else least(coalesce(p_refund, tx.net_amount), tx.net_amount) end;
  if refund <= 0 then
    raise exception 'refund must be positive';
  end if;

  update transactions set status = p_status, status_date = coalesce(p_date, current_date), status_reason = coalesce(p_reason, ''), refund_amount = refund where id = tx.id;

  for line in select product_id, qty from transaction_items where transaction_id = tx.id and deleted_at is null loop
    ret_qty := case when p_status = 'cancelled' then line.qty else floor(line.qty * refund / greatest(tx.net_amount, 0.01)) end;
    if ret_qty > 0 then
      insert into stock_movements (business_id, product_id, qty, kind, unit_cost, transaction_id, date, note, created_by)
      values (tx.business_id, line.product_id, ret_qty, 'return', p_unit_cost, tx.id, coalesce(p_date, current_date), left(concat(p_status, ': ', coalesce(p_reason, '')), 200), actor);
      returned := returned + ret_qty;
    end if;
  end loop;

  select * into s from settlements where transaction_id = tx.id and deleted_at is null limit 1;
  if found then
    cash := case when s.status = 'received_in_bank' then tx.net_amount else coalesce(s.paid_amount, 0) end;
    claw := least(cash, refund);
    if claw > 0 then
      insert into clawbacks (business_id, transaction_id, payout_id, amount, note, created_by)
      values (tx.business_id, tx.id, s.payout_id, claw, left(concat(p_status, ': ', coalesce(p_reason, '')), 200), actor)
      returning id into claw_id;
    end if;
  end if;

  return jsonb_build_object('changed', true, 'status', p_status, 'refund', refund, 'returned', returned, 'clawback', claw, 'clawback_id', claw_id);
end;
$$;
