-- The column always meant "how this order reaches the guest"; the trade calls that the order
-- type, and the partner adapters we will write speak that word too.
ALTER TABLE orders RENAME COLUMN fulfillment_mode TO order_type;
ALTER TABLE orders RENAME CONSTRAINT orders_fulfillment_mode_chk TO orders_order_type_chk;
