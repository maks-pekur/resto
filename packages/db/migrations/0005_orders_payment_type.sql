-- How the guest pays, as opposed to whether they have. Every order taken so far was prepaid
-- online; cash and card-on-delivery arrive with the delivery work.
ALTER TABLE orders ADD COLUMN payment_type text NOT NULL DEFAULT 'online';
ALTER TABLE orders ADD CONSTRAINT orders_payment_type_chk
  CHECK (payment_type IN ('online', 'cash', 'card_on_delivery'));
