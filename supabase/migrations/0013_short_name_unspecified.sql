-- Short names for ledger rows, chips, Home and the Units report; and the
-- backfill placeholders ("Unspecified") leave the pickers for good.
alter table products add column short_name text not null default '';

update products set short_name = '1 kg packs' where id = '00000000-0000-4000-8000-0000000000b1';
update products set short_name = '500 g packs' where id = '00000000-0000-4000-8000-0000000000b2';

-- Placeholders stay on old rows but are no longer selectable.
update products set active = false where variant = 'Unspecified';
