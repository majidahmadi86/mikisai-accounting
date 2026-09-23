-- v3.5: the real sugars, named in both languages, with a buying unit that can
-- differ from the selling unit (a box of 10 bags).
--
-- name stays as the key the importer matches on; name_en and name_th are what
-- people read, in the language they are using.
alter table products add column if not exists name_en text null;
alter table products add column if not exists purchase_unit_label text null;
alter table products add column if not exists units_per_purchase_unit integer not null default 1 check (units_per_purchase_unit >= 1 and units_per_purchase_unit <= 10000);
alter table products drop constraint if exists products_purchase_unit_label_check;
alter table products add constraint products_purchase_unit_label_check check (purchase_unit_label is null or purchase_unit_label in ('box', 'bag', 'pack', 'piece', 'bottle', 'unit'));

update products set name_en = name where name_en is null;

-- A. Rung Nirand Amphawa, sold as 1 kg packs and 500 g packs of a 10 kg box.
update products
   set name_en = 'Rung Nirand Amphawa · 100% pure coconut sugar · 10 kg box',
       name_th = 'น้ำตาลมะพร้าวแท้ 100% รุ่งนิรันดร์ อัมพวา 10 กก.',
       purchase_unit_label = 'box',
       units_per_purchase_unit = 1
 where business_id = '00000000-0000-4000-8000-000000000001'
   and id in ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000b2');

-- B. Mali brand, sold by the bag and bought by the box of 10 bags.
update products
   set name_en = 'Mali brand · 100% pure coconut sugar · 1 kg bag (box of 10 bags)',
       name_th = 'น้ำตาลมะพร้าวแท้ 100% ตรามะลิ หอมหวานละมุนจากอัมพวา บรรจุ 1 กก. (1 กล่อง 10 ถุง)',
       short_name = 'Mali 1 kg bag',
       unit_label = 'bag',
       purchase_unit_label = 'box',
       units_per_purchase_unit = 10
 where business_id = '00000000-0000-4000-8000-000000000001'
   and id = '00000000-0000-4000-8000-0000000000b6';

-- C. Red Rose rock sugar: not listed yet, pack size and price still to come.
insert into products (id, business_id, name, name_en, name_th, product_line, variant, short_name, unit_label, purchase_unit_label, units_per_purchase_unit, default_price, default_cost, stock_mode, active)
values (
  '00000000-0000-4000-8000-0000000000b7',
  '00000000-0000-4000-8000-000000000001',
  'Red Rose rock sugar',
  'Red Rose brand (Rung Nirand) · premium selected rock sugar',
  'น้ำตาลกรวดคัดพิเศษ ตรากุหลาบแดง (รุ่งนิรันดร์)',
  'sugar',
  '',
  'Rock sugar',
  'bag',
  'box',
  1,
  0,
  0,
  'buy_to_order',
  true
)
on conflict (id) do update
   set name_en = excluded.name_en,
       name_th = excluded.name_th,
       short_name = excluded.short_name,
       unit_label = excluded.unit_label,
       purchase_unit_label = excluded.purchase_unit_label;
