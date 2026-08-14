-- 0076_payment_refunds_pending.sql
-- Phase 10 Plan 05 (D-11): payment_refunds must be able to hold a row
-- BEFORE Stripe is ever called (status='pending', no stripe_refund_id yet)
-- and a row that records a Stripe failure (status='failed', still no
-- stripe_refund_id). This is a payments-domain schema change required by
-- the TX2 / provider-call / TX3 restructure -- it adds no order field, so
-- it is its own migration rather than folding into D-04's order-field
-- migration 0073, and it could not have been authored before the
-- restructure design existed.

ALTER TABLE payment_refunds ALTER COLUMN stripe_refund_id DROP NOT NULL;
--> statement-breakpoint

ALTER TABLE payment_refunds ADD COLUMN refund_request_id text;
--> statement-breakpoint

-- Existing rows predate the refundRequestId idempotency key and must not be
-- synthesised into something that looks like a real request id -- the
-- 'legacy:' prefix makes them unmistakable.
UPDATE payment_refunds SET refund_request_id = 'legacy:' || id::text WHERE refund_request_id IS NULL;
--> statement-breakpoint

ALTER TABLE payment_refunds ALTER COLUMN refund_request_id SET NOT NULL;
--> statement-breakpoint

ALTER TABLE payment_refunds ADD COLUMN failure_reason text;
--> statement-breakpoint

ALTER TABLE payment_refunds ADD COLUMN updated_at timestamp with time zone NOT NULL DEFAULT now();
--> statement-breakpoint

CREATE UNIQUE INDEX payment_refunds_request_id_uq ON payment_refunds USING btree (tenant_id, refund_request_id);
