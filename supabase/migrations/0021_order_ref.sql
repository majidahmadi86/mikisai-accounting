-- Order identity (v2.8, section 2): the platform order number gets its own
-- column, indexed per platform, instead of living inside the note as "#…".
-- Existing notes are split: the "#<digits>" part moves to order_ref and is
-- stripped from the note.

alter table transactions add column if not exists order_ref text null;
create index if not exists transactions_order_ref_idx on transactions (business_id, platform, order_ref) where order_ref is not null;

update transactions
   set order_ref = substring(note from '#(\d{6,})'),
       note = btrim(regexp_replace(regexp_replace(note, '#\d{6,}', '', 'g'), '^\s*·\s*|\s*·\s*$', '', 'g'))
 where order_ref is null and note ~ '#\d{6,}';
