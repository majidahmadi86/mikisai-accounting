-- Who last edited a ledger row, so a row can read "created by Sai · edited by Mike".
alter table transactions add column updated_by uuid null references auth.users (id) on delete set null, add column updated_at timestamptz null;
alter table payouts add column updated_by uuid null references auth.users (id) on delete set null, add column updated_at timestamptz null;
alter table internal_transfers add column updated_by uuid null references auth.users (id) on delete set null, add column updated_at timestamptz null;

create or replace function stamp_updated_by()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Soft delete and restore are not edits of the row's content.
  if new.deleted_at is distinct from old.deleted_at then
    return new;
  end if;
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;

create trigger transactions_stamp_updated before update on transactions for each row execute function stamp_updated_by();
create trigger payouts_stamp_updated before update on payouts for each row execute function stamp_updated_by();
create trigger internal_transfers_stamp_updated before update on internal_transfers for each row execute function stamp_updated_by();
