-- Expense categories become data the admin manages, in both languages.
-- transactions.category (enum) is replaced by category_id; old rows keep their
-- category through the backfill below.

create table expense_categories (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,
  name_en text not null check (btrim(name_en) <> ''),
  name_th text not null check (btrim(name_th) <> ''),
  sort integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null default auth.uid()
);
create index expense_categories_business_sort_idx on expense_categories (business_id, sort);
create unique index expense_categories_business_name_key on expense_categories (business_id, lower(name_en));

alter table expense_categories enable row level security;
create policy "members read expense categories" on expense_categories for select to authenticated using (business_id = current_business_id());
create policy "admin adds expense categories" on expense_categories for insert to authenticated with check (business_id = current_business_id() and is_admin());
create policy "admin edits expense categories" on expense_categories for update to authenticated using (business_id = current_business_id() and is_admin()) with check (business_id = current_business_id() and is_admin());
-- no delete policy: categories are deactivated, never removed

create trigger expense_categories_audit after insert or update or delete on expense_categories
  for each row execute function audit_row_change('expense_category');

-- Default set for the MikiSai business, with stable ids so the backfill can map the old enum.
insert into expense_categories (id, business_id, name_en, name_th, sort) values
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-000000000001', 'Stock purchase', 'ซื้อสต็อก', 10),
  ('00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-000000000001', 'Samples', 'ตัวอย่างสินค้า', 20),
  ('00000000-0000-4000-8000-0000000000c3', '00000000-0000-4000-8000-000000000001', 'Packaging', 'บรรจุภัณฑ์', 30),
  ('00000000-0000-4000-8000-0000000000c4', '00000000-0000-4000-8000-000000000001', 'Shipping', 'ค่าส่ง', 40),
  ('00000000-0000-4000-8000-0000000000c5', '00000000-0000-4000-8000-000000000001', 'Transport', 'ค่าเดินทาง', 50),
  ('00000000-0000-4000-8000-0000000000c6', '00000000-0000-4000-8000-000000000001', 'Ads', 'ค่าโฆษณา', 60),
  ('00000000-0000-4000-8000-0000000000c7', '00000000-0000-4000-8000-000000000001', 'Office', 'สำนักงาน', 70),
  ('00000000-0000-4000-8000-0000000000c8', '00000000-0000-4000-8000-000000000001', 'Handyman and repairs', 'ช่างและงานซ่อม', 80),
  ('00000000-0000-4000-8000-0000000000c9', '00000000-0000-4000-8000-000000000001', 'Registration and fees', 'ค่าจดทะเบียนและค่าธรรมเนียม', 90),
  ('00000000-0000-4000-8000-0000000000ca', '00000000-0000-4000-8000-000000000001', 'Other', 'อื่น ๆ', 100);

alter table transactions add column category_id uuid null references expense_categories (id);

update transactions set category_id = case category
  when 'product_cost' then '00000000-0000-4000-8000-0000000000c1'::uuid
  when 'packaging' then '00000000-0000-4000-8000-0000000000c3'::uuid
  when 'shipping' then '00000000-0000-4000-8000-0000000000c4'::uuid
  when 'ads' then '00000000-0000-4000-8000-0000000000c6'::uuid
  when 'registration' then '00000000-0000-4000-8000-0000000000c9'::uuid
  else '00000000-0000-4000-8000-0000000000ca'::uuid
end
where type = 'expense';

alter table transactions drop constraint transactions_category_by_type;
alter table transactions add constraint transactions_category_by_type check (
  (type = 'expense' and category_id is not null) or (type = 'income' and category_id is null)
);
alter table transactions drop column category;
drop type expense_category;

create index transactions_business_category_idx on transactions (business_id, category_id) where deleted_at is null;
