-- Honest expectations: what a unit really brings in after platform fees and
-- discounts. Null means "use standard sale price x (1 - platform fee)".
alter table products add column expected_net_per_unit numeric(12, 2) null check (expected_net_per_unit is null or expected_net_per_unit >= 0);
