-- Internal transfers carry a mandatory reason. The kind (settlement or capital)
-- is derived from it, in the database, so no path can set them inconsistently.

create type transfer_reason as enum ('stock_purchase', 'samples', 'profit_settlement', 'expense_reimbursement', 'other');

alter table internal_transfers add column reason transfer_reason null;
update internal_transfers set reason = case when kind = 'settlement' then 'profit_settlement'::transfer_reason else 'stock_purchase'::transfer_reason end;
alter table internal_transfers alter column reason set not null;

-- "Other" must say what it was.
alter table internal_transfers add constraint internal_transfers_other_needs_note check (reason <> 'other' or btrim(note) <> '');

create or replace function derive_transfer_kind()
returns trigger
language plpgsql
as $$
begin
  new.kind := case when new.reason = 'profit_settlement' then 'settlement'::transfer_kind else 'capital'::transfer_kind end;
  return new;
end;
$$;

create trigger internal_transfers_derive_kind
  before insert or update of reason, kind on internal_transfers
  for each row execute function derive_transfer_kind();
