-- Buy to order: a product may be sold before it is bought. Negative stock on
-- such a product is a purchase backlog, not an error. Stocked products are
-- expected never to go negative; Data health flags them when they do.
alter table products add column stock_mode text not null default 'buy_to_order';
alter table products add constraint products_stock_mode_check check (stock_mode in ('buy_to_order', 'stocked'));
