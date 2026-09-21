-- 0026 tried to add the Return cost category under an id that Registration
-- and fees already holds, so nothing was inserted. It gets its own id here.
insert into expense_categories (id, business_id, name_en, name_th, sort)
values ('00000000-0000-4000-8000-0000000000cb', '00000000-0000-4000-8000-000000000001', 'Return cost', 'ค่าเสียหายจากการคืนสินค้า', 95)
on conflict do nothing;
