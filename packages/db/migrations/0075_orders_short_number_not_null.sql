-- 0075_orders_short_number_not_null.sql
-- Phase 10 Plan 04: tighten orders.short_number to NOT NULL now that the
-- generator exists (order_daily_sequences + CreateOrderService's
-- nextShortNumber call, landed earlier in this plan). 0073 deliberately
-- left this column nullable -- there was no generator yet, and short_number
-- has no single static default that is correct per row (each order needs
-- its own counter value), so it could not ride the plain
-- ADD COLUMN ... NOT NULL DEFAULT ... path 0073 used for channel/
-- marketing_consent.
--
-- Row-count check (mirrors the 0070_orders_location_id.sql precedent):
--   SELECT count(*) FROM orders WHERE short_number IS NULL;  -->  0
-- The shared dev database has zero orders rows at plan-execution time, so
-- there is nothing to clear or backfill -- this migration is a pure
-- constraint tightening. Fresh/testcontainer databases are likewise always
-- empty at this migration, so the ALTER below never fails there either.

ALTER TABLE orders ALTER COLUMN short_number SET NOT NULL;
