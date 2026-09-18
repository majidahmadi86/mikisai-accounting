-- Cascade integrity (v2.8, section 1).
--
-- A transaction's lines, stock movements and settlement live and die with it:
-- soft-deleting the row soft-deletes them in the same database transaction,
-- restoring it restores exactly the ones that went with it. Editing a purchase
-- or sale already re-derives its movements atomically inside
-- replace_transaction_items. Rows whose parent was deleted before this rule
-- existed are soft-deleted here with a system_correction audit note.

alter table stock_movements add column if not exists deleted_at timestamptz null, add column if not exists deleted_by uuid references auth.users (id) on delete set null;
alter table transaction_items add column if not exists deleted_at timestamptz null, add column if not exists deleted_by uuid references auth.users (id) on delete set null;
alter table settlements add column if not exists deleted_at timestamptz null, add column if not exists deleted_by uuid references auth.users (id) on delete set null;

create index if not exists stock_movements_live_idx on stock_movements (business_id, product_id, date) where deleted_at is null;
create index if not exists transaction_items_live_idx on transaction_items (business_id, transaction_id) where deleted_at is null;
create index if not exists settlements_live_idx on settlements (business_id, status) where deleted_at is null;

-- Runs as the definer so a contributor's own-row undo cascades even though only
-- the admin may update movements directly.
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
  elsif old.deleted_at is not null and new.deleted_at is null then
    update stock_movements set deleted_at = null, deleted_by = null where transaction_id = new.id and deleted_at = old.deleted_at;
    update transaction_items set deleted_at = null, deleted_by = null where transaction_id = new.id and deleted_at = old.deleted_at;
    update settlements set deleted_at = null, deleted_by = null where transaction_id = new.id and deleted_at = old.deleted_at;
  end if;
  return null;
end;
$$;

drop trigger if exists transactions_cascade_soft_delete on transactions;
create trigger transactions_cascade_soft_delete after update of deleted_at on transactions
  for each row execute function cascade_transaction_soft_delete();

-- Orphans from before this rule: children whose parent is already deleted.
do $$
declare
  fixed_movements uuid[];
  fixed_items uuid[];
  fixed_settlements uuid[];
  biz uuid;
begin
  select array_agg(m.id) into fixed_movements
    from stock_movements m join transactions t on t.id = m.transaction_id
    where t.deleted_at is not null and m.deleted_at is null;
  select array_agg(i.id) into fixed_items
    from transaction_items i join transactions t on t.id = i.transaction_id
    where t.deleted_at is not null and i.deleted_at is null;
  select array_agg(s.id) into fixed_settlements
    from settlements s join transactions t on t.id = s.transaction_id
    where t.deleted_at is not null and s.deleted_at is null;

  update stock_movements m set deleted_at = t.deleted_at, deleted_by = t.deleted_by
    from transactions t where t.id = m.transaction_id and t.deleted_at is not null and m.deleted_at is null;
  update transaction_items i set deleted_at = t.deleted_at, deleted_by = t.deleted_by
    from transactions t where t.id = i.transaction_id and t.deleted_at is not null and i.deleted_at is null;
  update settlements s set deleted_at = t.deleted_at, deleted_by = t.deleted_by
    from transactions t where t.id = s.transaction_id and t.deleted_at is not null and s.deleted_at is null;

  if coalesce(array_length(fixed_movements, 1), 0) + coalesce(array_length(fixed_items, 1), 0) + coalesce(array_length(fixed_settlements, 1), 0) > 0 then
    for biz in select distinct business_id from transactions where deleted_at is not null loop
      insert into audit_log (business_id, actor_user_id, action, entity_type, entity_id, before, after)
      values (biz, null, 'update', 'system_correction', 'migration-0020', jsonb_build_object('orphaned', true),
        jsonb_build_object('why', 'v2.8: children of deleted transactions soft-deleted with their parent',
                           'stock_movements', to_jsonb(coalesce(fixed_movements, '{}'::uuid[])),
                           'transaction_items', to_jsonb(coalesce(fixed_items, '{}'::uuid[])),
                           'settlements', to_jsonb(coalesce(fixed_settlements, '{}'::uuid[]))));
    end loop;
  end if;
  raise notice 'orphans soft-deleted: % movements, % items, % settlements', coalesce(array_length(fixed_movements, 1), 0), coalesce(array_length(fixed_items, 1), 0), coalesce(array_length(fixed_settlements, 1), 0);
end $$;

-- The items RPC replaces a row's lines and movements wholesale; deleted ones go too.
-- (replace_transaction_items already deletes by transaction_id, so nothing changes there.)
