-- 0073_orders_intake.sql
-- Phase 10 Plan 01 (D-04): land every order-schema field the whole phase
-- needs before any real order is written -- short daily order number,
-- channel, per-state timestamps, cancel reason + canceled_from_status +
-- actors, operator ETA, marketing consent -- plus the per-location daily
-- counter table that generates the short number and the covering feed
-- index.
--
-- (a) short_number is added nullable here and tightened to NOT NULL by
--     0075 in plan 10-04, because the generator that fills it
--     (CreateOrderService + order_daily_sequences) does not exist until
--     that plan. Do not add it NOT NULL now -- there is no single static
--     default that is correct per row.
-- (b) Growth MED-18 invariant, recorded here for future maintainers: orders
--     are INSERTed at status='created' before payment, so count(orders) is
--     the correct ANL-04 conversion denominator -- a future stale-order
--     sweep must not delete unpaid `created` rows.
-- (c) channel has exactly one producible value ('site') until QR ordering
--     ships -- apps/qr-menu has no order-submission path yet.

-- Row-count guidance (mirrors 0070_orders_location_id.sql's precedent):
-- existing dev-only order rows are left as-is here -- short_number stays
-- nullable at this stage, so no backfill/clear is required for THIS
-- migration. Plan 10-04's 0075 is where any stale dev rows are cleared
-- (or backfilled) before short_number is tightened to SET NOT NULL.
ALTER TABLE orders ADD COLUMN short_number integer;
--> statement-breakpoint
ALTER TABLE orders ADD COLUMN channel text NOT NULL DEFAULT 'site';
--> statement-breakpoint
ALTER TABLE orders ADD COLUMN accepted_at timestamp with time zone;
--> statement-breakpoint
ALTER TABLE orders ADD COLUMN preparing_at timestamp with time zone;
--> statement-breakpoint
ALTER TABLE orders ADD COLUMN ready_at timestamp with time zone;
--> statement-breakpoint
ALTER TABLE orders ADD COLUMN completed_at timestamp with time zone;
--> statement-breakpoint
ALTER TABLE orders ADD COLUMN canceled_at timestamp with time zone;
--> statement-breakpoint
ALTER TABLE orders ADD COLUMN accepted_by_user_id text;
--> statement-breakpoint
ALTER TABLE orders ADD COLUMN canceled_by_user_id text;
--> statement-breakpoint
ALTER TABLE orders ADD COLUMN cancel_reason text;
--> statement-breakpoint
ALTER TABLE orders ADD COLUMN cancel_note text;
--> statement-breakpoint
ALTER TABLE orders ADD COLUMN canceled_from_status text;
--> statement-breakpoint
ALTER TABLE orders ADD COLUMN eta_at timestamp with time zone;
--> statement-breakpoint
ALTER TABLE orders ADD COLUMN marketing_consent boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE orders ADD COLUMN marketing_consent_at timestamp with time zone;
--> statement-breakpoint

ALTER TABLE orders ADD CONSTRAINT orders_channel_chk CHECK (channel IN ('site','qr-menu'));
--> statement-breakpoint
ALTER TABLE orders ADD CONSTRAINT orders_cancel_reason_chk CHECK (
  cancel_reason IS NULL OR cancel_reason IN (
    'guest_no_show','kitchen_out_of_stock','kitchen_too_busy','guest_requested',
    'payment_issue','duplicate_order','other'
  )
);
--> statement-breakpoint
ALTER TABLE orders ADD CONSTRAINT orders_canceled_from_status_chk CHECK (
  canceled_from_status IS NULL OR canceled_from_status IN (
    'created','requires_action','paid','accepted','preparing','ready','completed',
    'canceled','refunded','failed'
  )
);
--> statement-breakpoint

CREATE INDEX orders_feed_idx ON orders USING btree (tenant_id, location_id, status, created_at DESC);
--> statement-breakpoint

CREATE TABLE order_daily_sequences (
  tenant_id uuid NOT NULL,
  location_id uuid NOT NULL,
  business_date date NOT NULL,
  counter integer NOT NULL DEFAULT 0,
  CONSTRAINT order_daily_sequences_pk PRIMARY KEY (tenant_id, location_id, business_date)
);
--> statement-breakpoint

ALTER TABLE order_daily_sequences
  ADD CONSTRAINT order_daily_sequences_tenant_fk
  FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE order_daily_sequences
  ADD CONSTRAINT order_daily_sequences_location_fk
  FOREIGN KEY (location_id, tenant_id) REFERENCES public.locations(id, tenant_id) ON DELETE restrict;
--> statement-breakpoint

ALTER TABLE order_daily_sequences ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE order_daily_sequences FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

-- Baseline PERMISSIVE tenant policy is mandatory: with FORCE RLS and zero
-- applicable PERMISSIVE policies, Postgres denies every row regardless of
-- any RESTRICTIVE policy present (the exact bug 0067_location_tenant_iso.sql
-- had to retrofit for locations/member_location_scope).
CREATE POLICY order_daily_sequences_iso ON order_daily_sequences
  USING (is_system_session() OR tenant_id = current_tenant_id())
  WITH CHECK (is_system_session() OR tenant_id = current_tenant_id());
--> statement-breakpoint

CREATE POLICY order_daily_sequences_location_iso ON order_daily_sequences
  AS RESTRICTIVE
  USING (is_system_session() OR current_location_id() IS NULL OR location_id = current_location_id())
  WITH CHECK (is_system_session() OR current_location_id() IS NULL OR location_id = current_location_id());
