-- Plain words for why money moved between the partners. Every reason changes
-- who owes whom; the reason only explains why. Existing rows keep their
-- meaning under the new names.
alter type transfer_reason rename value 'stock_purchase' to 'for_stock';
alter type transfer_reason rename value 'samples' to 'for_samples';
alter type transfer_reason rename value 'expense_reimbursement' to 'my_half_of_costs';
alter type transfer_reason rename value 'profit_settlement' to 'profit_share';

create or replace function derive_transfer_kind()
returns trigger
language plpgsql
as $$
begin
  new.kind := case when new.reason = 'profit_share' then 'settlement'::transfer_kind else 'capital'::transfer_kind end;
  return new;
end;
$$;
