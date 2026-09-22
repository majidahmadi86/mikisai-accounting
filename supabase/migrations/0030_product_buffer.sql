-- v3.4: the weekly buy buffer is per product. Empty means the default for the
-- unit: 5 for boxes, 0 for anything else (so the 1 kg bag is 0 unless set).
alter table products add column if not exists buffer_units integer null check (buffer_units is null or (buffer_units >= 0 and buffer_units <= 1000));
