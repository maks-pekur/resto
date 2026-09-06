-- An order now carries two independent facts: how far the kitchen has taken it, and whether the
-- money arrived. They were one column, which is why staff could not see an order before it was
-- paid — and why "confirm first, pay after" could not be expressed at all.
ALTER TABLE orders ADD COLUMN payment_status text NOT NULL DEFAULT 'pending';
ALTER TABLE orders ADD COLUMN paid_at timestamptz;

UPDATE orders SET payment_status = 'requires_action' WHERE status = 'requires_action';
UPDATE orders SET payment_status = 'failed' WHERE status = 'failed';
UPDATE orders SET payment_status = 'refunded' WHERE status = 'refunded';
UPDATE orders
   SET payment_status = 'paid', paid_at = COALESCE(accepted_at, updated_at)
 WHERE status IN ('paid', 'accepted', 'preparing', 'ready', 'completed');

-- The old checks name the old values, so they go before the rows are rewritten.
ALTER TABLE orders DROP CONSTRAINT orders_status_chk;
ALTER TABLE orders DROP CONSTRAINT orders_canceled_from_status_chk;

-- `status` keeps the fulfilment stage alone.
UPDATE orders SET status = 'placed' WHERE status IN ('created', 'requires_action', 'paid');
UPDATE orders SET status = 'canceled' WHERE status IN ('refunded', 'failed');
UPDATE orders SET canceled_from_status = 'placed'
 WHERE canceled_from_status IN ('created', 'requires_action', 'paid');
UPDATE orders SET canceled_from_status = 'canceled'
 WHERE canceled_from_status IN ('refunded', 'failed');

ALTER TABLE orders ADD CONSTRAINT orders_status_chk CHECK (
  status IN ('placed', 'accepted', 'preparing', 'ready', 'completed', 'canceled')
);
ALTER TABLE orders ADD CONSTRAINT orders_canceled_from_status_chk CHECK (
  canceled_from_status IS NULL
  OR canceled_from_status IN ('placed', 'accepted', 'preparing', 'ready', 'completed', 'canceled')
);
ALTER TABLE orders ADD CONSTRAINT orders_payment_status_chk CHECK (
  payment_status IN ('pending', 'requires_action', 'paid', 'failed', 'refunded')
);
-- The timestamp and the state cannot disagree about whether the money arrived.
ALTER TABLE orders ADD CONSTRAINT orders_paid_at_chk CHECK (
  (payment_status = 'paid') = (paid_at IS NOT NULL)
);
