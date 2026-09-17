-- Samples sit on named sample products, valued at what was paid for them.
-- The three units on "Other · Unspecified" (the 14 Sept ฿890 row) move to
-- Sample sugar A, B and C at 296.67, 296.67 and 296.66, which is ฿890.00 to
-- the satang. The sample products become active so they can be picked.
do $$
declare
  biz uuid := '00000000-0000-4000-8000-000000000001';
  placeholder uuid := '00000000-0000-4000-8000-0000000000a3';
  samples uuid[] := array['00000000-0000-4000-8000-0000000000b3', '00000000-0000-4000-8000-0000000000b4', '00000000-0000-4000-8000-0000000000b5'];
  costs numeric[] := array[296.67, 296.67, 296.66];
  it record;
  i integer;
begin
  update products set active = true where id = any(samples) and business_id = biz;

  for it in select * from transaction_items where business_id = biz and product_id = placeholder and qty = 3 loop
    delete from stock_movements where transaction_id = it.transaction_id and product_id = placeholder;
    delete from transaction_items where id = it.id;
    for i in 1..3 loop
      insert into transaction_items (business_id, transaction_id, product_id, qty, unit_price, unit_cost, created_by)
      values (biz, it.transaction_id, samples[i], 1, 0, costs[i], it.created_by);
      insert into stock_movements (business_id, product_id, qty, kind, unit_cost, transaction_id, date, note, created_by)
      select biz, samples[i], 1, 'purchase', costs[i], t.id, t.date, coalesce(t.note, ''), it.created_by from transactions t where t.id = it.transaction_id;
      insert into stock_movements (business_id, product_id, qty, kind, unit_cost, transaction_id, date, note, created_by)
      select biz, samples[i], -1, 'sample', null, t.id, t.date, coalesce(t.note, ''), it.created_by from transactions t where t.id = it.transaction_id;
    end loop;
    insert into audit_log (business_id, actor_user_id, action, entity_type, entity_id, before, after)
    values (biz, null, 'update', 'transaction_item', it.id::text, jsonb_build_object('product_id', placeholder, 'qty', 3, 'unit_cost', it.unit_cost), jsonb_build_object('system_correction', 'v2.6 samples on named sample products at purchase cost', 'transaction_id', it.transaction_id));
  end loop;
end $$;
