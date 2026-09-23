-- v3.5: the Mali bag's pack size is part of its name now, so the variant that
-- repeated it ("1 kg bag") is cleared; the short name carries the list label.
update products
   set variant = ''
 where business_id = '00000000-0000-4000-8000-000000000001'
   and id = '00000000-0000-4000-8000-0000000000b6'
   and variant = '1 kg bag';
