-- Payouts that cover part of an order (TikTok's 70/30 early payout): the
-- amount already in the bank is recorded on the settlement, the remainder
-- stays pending on its own.
alter table settlements add column paid_amount numeric(12, 2) not null default 0 check (paid_amount >= 0);
update settlements set paid_amount = t.net_amount from transactions t where t.id = settlements.transaction_id and settlements.status = 'received_in_bank';
