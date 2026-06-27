-- Phase 8 plan 01: payments/order/tenant money-path schema redesign
-- Adds: PaymentIntent model, partial-refund accounting, SCA state,
-- Stripe-account linkage, tenant capability flags, guest email (B2/GNOTIF).
--
-- Does NOT touch tenancy_erase_tenant: orders rows (including the new
-- customer_email column) are already hard-deleted by 0051
-- DELETE FROM orders WHERE tenant_id = p_tenant_id.

--> statement-breakpoint
-- ─── payments: new columns ──────────────────────────────────────────────────
ALTER TABLE "payments"
  ADD COLUMN IF NOT EXISTS "payment_intent_id"    text,
  ADD COLUMN IF NOT EXISTS "latest_charge_id"     text,
  ADD COLUMN IF NOT EXISTS "refunded_amount"      numeric(12, 2) NOT NULL DEFAULT '0.00',
  ADD COLUMN IF NOT EXISTS "stripe_account_id"    text,
  ADD COLUMN IF NOT EXISTS "application_fee_amount" numeric(12, 2) NOT NULL DEFAULT '0.00';
--> statement-breakpoint
-- payments.status CHECK: add requires_action + partially_refunded
ALTER TABLE "payments" DROP CONSTRAINT IF EXISTS "payments_status_chk";
--> statement-breakpoint
ALTER TABLE "payments"
  ADD CONSTRAINT "payments_status_chk"
  CHECK (status IN ('pending','requires_action','succeeded','failed','refunded','partially_refunded'));
--> statement-breakpoint
-- partial unique index: one payment row per PaymentIntent per tenant (D-07)
CREATE UNIQUE INDEX IF NOT EXISTS "payments_payment_intent_id_uq"
  ON "payments" ("tenant_id", "payment_intent_id")
  WHERE "payment_intent_id" IS NOT NULL;
--> statement-breakpoint
-- expose UNIQUE (id, tenant_id) on payments so payment_refunds can carry composite FK
CREATE UNIQUE INDEX IF NOT EXISTS "payments_id_tenant_uq"
  ON "payments" ("id", "tenant_id");
--> statement-breakpoint
-- ─── payment_refunds: new table ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "payment_refunds" (
  "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"        uuid NOT NULL,
  "payment_id"       uuid NOT NULL,
  "stripe_refund_id" text NOT NULL,
  "amount"           numeric(12, 2) NOT NULL,
  "reason"           text NOT NULL,
  "status"           text NOT NULL DEFAULT 'pending',
  "created_at"       timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "payment_refunds_status_chk"
    CHECK (status IN ('pending','succeeded','failed'))
);
--> statement-breakpoint
ALTER TABLE "payment_refunds"
  ADD CONSTRAINT "payment_refunds_tenant_fk"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
-- T-08-01: composite FK to payments(id, tenant_id) — cross-tenant phantom guard
ALTER TABLE "payment_refunds"
  ADD CONSTRAINT "payment_refunds_payment_fk"
  FOREIGN KEY ("payment_id", "tenant_id") REFERENCES "public"."payments"("id", "tenant_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
-- T-08-02: one row per Stripe Refund id per tenant
CREATE UNIQUE INDEX IF NOT EXISTS "payment_refunds_stripe_refund_id_uq"
  ON "payment_refunds" ("tenant_id", "stripe_refund_id");
--> statement-breakpoint
-- T-08-01: RLS — mirrors the payments_iso policy in 0049
ALTER TABLE "payment_refunds" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "payment_refunds" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "payment_refunds_iso" ON "payment_refunds"
  USING (is_system_session() OR tenant_id = current_tenant_id())
  WITH CHECK (is_system_session() OR tenant_id = current_tenant_id());
--> statement-breakpoint
-- T-08-01: no DELETE grant — soft-delete rule (status acts as tombstone)
DO $grant$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'resto_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON TABLE payment_refunds TO resto_app';
  END IF;
END
$grant$;
--> statement-breakpoint
-- ─── orders: guest email (B2/GNOTIF-01/03) ──────────────────────────────────
-- GDPR: erased via 0051 DELETE FROM orders WHERE tenant_id = p_tenant_id
-- (tenancy_erase_tenant hard-deletes the whole row — no change to 0051 needed)
ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "customer_email" text;
--> statement-breakpoint
-- orders.status CHECK: add requires_action (D-08 SCA intermediate state)
ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_status_chk";
--> statement-breakpoint
ALTER TABLE "orders"
  ADD CONSTRAINT "orders_status_chk"
  CHECK (status IN ('created','requires_action','paid','accepted','preparing','ready','completed','canceled','refunded','failed'));
--> statement-breakpoint
-- ─── tenants: Stripe capability columns (D-12) ──────────────────────────────
ALTER TABLE "tenants"
  ADD COLUMN IF NOT EXISTS "stripe_charges_enabled"   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "stripe_payouts_enabled"   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "stripe_onboarding_status" text NOT NULL DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS "stripe_requirements_due"  jsonb;
--> statement-breakpoint
ALTER TABLE "tenants"
  ADD CONSTRAINT "tenants_stripe_onboarding_status_chk"
  CHECK (stripe_onboarding_status IN ('not_started','pending','complete','restricted'));
