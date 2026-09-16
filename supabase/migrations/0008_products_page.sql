-- Products page: bilingual name, platform list prices, photo, notes; the real
-- MikiSai products replace the backfilled "Sugar · Unspecified".

alter table products
  add column name_th text not null default '',
  add column list_prices jsonb not null default '{}'::jsonb,
  add column photo_path text null,
  add column notes text not null default '';

alter table products drop constraint if exists products_unit_label_check;
alter table products add constraint products_unit_label_check check (unit_label in ('box', 'pack', 'piece', 'bottle', 'unit'));

-- Public bucket for product photos (nothing sensitive; paths are <business_id>/<product_id>.<ext>).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-photos', 'product-photos', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Real products. Ids are fixed so the reassignment below and the tests can refer to them.
insert into products (id, business_id, name, name_th, product_line, variant, unit_label, default_cost, default_price, list_prices, low_stock_threshold, active)
values
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000001', 'Coconut sugar Rung Nirand Amphawa', 'น้ำตาลมะพร้าว รุ่งนิรันดร์ อัมพวา', 'sugar', '10 kg box (1 kg x 10 packs)', 'box', 260, 399, '{"tiktok": 399}'::jsonb, 3, true),
  ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-000000000001', 'Coconut sugar Rung Nirand Amphawa', 'น้ำตาลมะพร้าว รุ่งนิรันดร์ อัมพวา', 'sugar', '10 kg box (500 g x 20 packs)', 'box', 260, 399, '{"tiktok": 399}'::jsonb, 3, true),
  ('00000000-0000-4000-8000-0000000000b3', '00000000-0000-4000-8000-000000000001', 'Sample sugar A', 'น้ำตาลตัวอย่าง A', 'sugar', '10 kg', 'box', 296.67, 0, '{}'::jsonb, 0, false),
  ('00000000-0000-4000-8000-0000000000b4', '00000000-0000-4000-8000-000000000001', 'Sample sugar B', 'น้ำตาลตัวอย่าง B', 'sugar', '10 kg', 'box', 296.67, 0, '{}'::jsonb, 0, false),
  ('00000000-0000-4000-8000-0000000000b5', '00000000-0000-4000-8000-000000000001', 'Sample sugar C', 'น้ำตาลตัวอย่าง C', 'sugar', '10 kg', 'box', 296.67, 0, '{}'::jsonb, 0, false);

-- Every line and movement on "Sugar · Unspecified" moves to the 1 kg x 10 packs box, then the placeholder is hidden.
update transaction_items set product_id = '00000000-0000-4000-8000-0000000000b1' where product_id = '00000000-0000-4000-8000-0000000000a1';
update stock_movements set product_id = '00000000-0000-4000-8000-0000000000b1' where product_id = '00000000-0000-4000-8000-0000000000a1';
update products set deleted_at = now(), active = false where id = '00000000-0000-4000-8000-0000000000a1';
