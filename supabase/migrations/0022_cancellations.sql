-- Cancellations and refunds (v2.8, section 3).
--
-- A sale keeps its row and gets a status: active, cancelled or refunded, with
-- the day, the reason and the amount the platform takes back. Marking an order
-- runs inside one database function so the row, the return movement and the
-- clawback are written together or not at all: units go back to stock at the
-- cost they were charged, and money already paid out becomes a pending
-- clawback (the negative settlement) that the next payout reconciliation
-- offsets.

alter table transactions
  add column if not exists status text not null default 'active' check (status in ('active', 'cancelled', 'refunded')),
  add column if not exists status_date date null,
  add column if not exists status_reason text not null default '',
  add column if not exists refund_amount numeric(12, 2) null check (refund_amount is null or refund_amount >= 0);
create index if not exists transactions_status_idx on transactions (business_id, status) where status <> 'active';

create table if not exists clawbacks (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,
  transaction_id uuid not null references transactions (id) on delete cascade,
  /** The payout that had paid the order, when known. */
  payout_id uuid null references payouts (id) on delete set null,
  amount numeric(12, 2) not null check (amount > 0),
  status text not null default 'pending' check (status in ('pending', 'offset')),
  offset_payout_id uuid null references payouts (id) on delete set null,
  note text not null default '',
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  deleted_at timestamptz null,
  deleted_by uuid references auth.users (id) on delete set null
);
create index if not exists clawbacks_business_status_idx on clawbacks (business_id, status) where deleted_at is null;
create index if not exists clawbacks_transaction_idx on clawbacks (transaction_id);

alter table clawbacks enable row level security;
create policy "members read clawbacks" on clawbacks for select to authenticated using (business_id = current_business_id());
create policy "members offset clawbacks" on clawbacks for update to authenticated
  using (business_id = current_business_id()) with check (business_id = current_business_id());

create trigger clawbacks_audit after insert or update or delete on clawbacks for each row execute function audit_row_change('clawback');

-- Children go with their transaction: clawbacks too.
create or replace function cascade_transaction_soft_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.deleted_at is null and new.deleted_at is not null then
    update stock_movements set deleted_at = new.deleted_at, deleted_by = new.deleted_by where transaction_id = new.id and deleted_at is null;
    update transaction_items set deleted_at = new.deleted_at, deleted_by = new.deleted_by where transaction_id = new.id and deleted_at is null;
    update settlements set deleted_at = new.deleted_at, deleted_by = new.deleted_by where transaction_id = new.id and deleted_at is null;
    update clawbacks set deleted_at = new.deleted_at, deleted_by = new.deleted_by where transaction_id = new.id and deleted_at is null;
  elsif old.deleted_at is not null and new.deleted_at is null then
    update stock_movements set deleted_at = null, deleted_by = null where transaction_id = new.id and deleted_at = old.deleted_at;
    update transaction_items set deleted_at = null, deleted_by = null where transaction_id = new.id and deleted_at = old.deleted_at;
    update settlements set deleted_at = null, deleted_by = null where transaction_id = new.id and deleted_at = old.deleted_at;
    update clawbacks set deleted_at = null, deleted_by = null where transaction_id = new.id and deleted_at = old.deleted_at;
  end if;
  return null;
end;
$$;

-- Mark a sale cancelled or refunded, or put it back to active. Any member of
-- the business may do this (a cancellation is a fact from the platform, not
-- an edit of someone's row). Everything below happens in one transaction.
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
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  select * into tx from transactions where id = p_id and business_id = current_business_id() and deleted_at is null for update;
  if not found then
    raise exception 'transaction not found';
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
    update stock_movements set deleted_at = now(), deleted_by = auth.uid() where transaction_id = tx.id and kind = 'return' and deleted_at is null;
    update clawbacks set deleted_at = now(), deleted_by = auth.uid() where transaction_id = tx.id and deleted_at is null;
    update transactions set status = 'active', status_date = null, status_reason = '', refund_amount = null where id = tx.id;
    return jsonb_build_object('changed', true, 'status', 'active');
  end if;

  if tx.status <> 'active' then
    raise exception 'order is already %', tx.status;
  end if;
  refund := case when p_status = 'cancelled' then tx.net_amount else least(coalesce(p_refund, tx.net_amount), tx.net_amount) end;
  if refund <= 0 then
    raise exception 'refund must be positive';
  end if;

  update transactions set status = p_status, status_date = coalesce(p_date, current_date), status_reason = coalesce(p_reason, ''), refund_amount = refund where id = tx.id;

  -- Units come back at the cost they were charged; a partial refund returns the matching share of units.
  for line in select product_id, qty from transaction_items where transaction_id = tx.id and deleted_at is null loop
    ret_qty := case when p_status = 'cancelled' then line.qty else floor(line.qty * refund / greatest(tx.net_amount, 0.01)) end;
    if ret_qty > 0 then
      insert into stock_movements (business_id, product_id, qty, kind, unit_cost, transaction_id, date, note, created_by)
      values (tx.business_id, line.product_id, ret_qty, 'return', p_unit_cost, tx.id, coalesce(p_date, current_date), left(concat(p_status, ': ', coalesce(p_reason, '')), 200), auth.uid());
      returned := returned + ret_qty;
    end if;
  end loop;

  -- Money already in the bank for this order must go back: a pending clawback the next payout offsets.
  select * into s from settlements where transaction_id = tx.id and deleted_at is null limit 1;
  if found then
    cash := case when s.status = 'received_in_bank' then tx.net_amount else coalesce(s.paid_amount, 0) end;
    claw := least(cash, refund);
    if claw > 0 then
      insert into clawbacks (business_id, transaction_id, payout_id, amount, note, created_by)
      values (tx.business_id, tx.id, s.payout_id, claw, left(concat(p_status, ': ', coalesce(p_reason, '')), 200), auth.uid())
      returning id into claw_id;
    end if;
  end if;

  return jsonb_build_object('changed', true, 'status', p_status, 'refund', refund, 'returned', returned, 'clawback', claw, 'clawback_id', claw_id);
end;
$$;

revoke all on function mark_order_status(uuid, text, date, text, numeric, numeric) from public;
grant execute on function mark_order_status(uuid, text, date, text, numeric, numeric) to authenticated;
