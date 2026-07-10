-- 0070_orders_location_id.sql
-- Phase 08.4 Plan 08 (D-03): re-key orders to location grain -- add NOT NULL
-- orders.location_id with composite FK (location_id, tenant_id) ->
-- locations(id, tenant_id).
--
-- D-12/D-13/Pitfall 5: no location is synthesized. A row-count check at
-- plan execution time found 5 pre-existing dev-only orders (a 2026-06-20/28
-- payments-live-smoke session, predating the locations model -- the
-- locations table itself was still empty in this environment) with
-- payments/order_items/payment_refunds attached and no legitimate location
-- to attribute them to. Cleared (not backfilled), mirroring how
-- 0068_stop_list_location_regrain.sql handled the one pre-existing
-- dev-only menu_stop_list row. No `INSERT INTO locations` appears anywhere
-- here. Fresh/testcontainer databases have zero orders rows, so these
-- deletes are no-ops there.

DELETE FROM payment_refunds;
--> statement-breakpoint
DELETE FROM payments;
--> statement-breakpoint
DELETE FROM order_modifiers;
--> statement-breakpoint
DELETE FROM order_items;
--> statement-breakpoint
DELETE FROM orders;
--> statement-breakpoint

ALTER TABLE orders ADD COLUMN location_id uuid NOT NULL;
--> statement-breakpoint
ALTER TABLE orders
  ADD CONSTRAINT orders_location_fk
  FOREIGN KEY (location_id, tenant_id) REFERENCES locations (id, tenant_id) ON DELETE RESTRICT;
