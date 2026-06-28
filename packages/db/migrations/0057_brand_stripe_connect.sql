-- Phase 08.1 plan 01: per-brand Stripe Connect columns (D-04/D-05/D-06)
-- Moves tenant.stripe_* columns to brand.stripe_* (clean reshape, no backfill).
-- brands already has RLS via 0013_brands_rls.sql — no new policy needed (RESEARCH Pitfall 5).

--> statement-breakpoint
-- ─── brands: add payment-connection columns ──────────────────────────────────
ALTER TABLE "brands"
  ADD COLUMN IF NOT EXISTS "payment_provider"         text NOT NULL DEFAULT 'stripe',
  ADD COLUMN IF NOT EXISTS "account_type"             text,
  ADD COLUMN IF NOT EXISTS "stripe_charges_enabled"   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "stripe_payouts_enabled"   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "stripe_onboarding_status" text NOT NULL DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS "stripe_requirements_due"  jsonb;
--> statement-breakpoint
ALTER TABLE "brands"
  ADD CONSTRAINT "brands_payment_provider_chk"
  CHECK (payment_provider IN ('stripe'));
--> statement-breakpoint
ALTER TABLE "brands"
  ADD CONSTRAINT "brands_account_type_chk"
  CHECK (account_type IS NULL OR account_type IN ('express', 'standard'));
--> statement-breakpoint
ALTER TABLE "brands"
  ADD CONSTRAINT "brands_stripe_onboarding_status_chk"
  CHECK (stripe_onboarding_status IN ('not_started', 'pending', 'complete', 'restricted'));
--> statement-breakpoint
-- ─── tenants: DROP the old per-tenant Stripe columns (D-06, no backfill) ─────
ALTER TABLE "tenants" DROP COLUMN IF EXISTS "stripe_account_id";
--> statement-breakpoint
ALTER TABLE "tenants" DROP COLUMN IF EXISTS "stripe_charges_enabled";
--> statement-breakpoint
ALTER TABLE "tenants" DROP COLUMN IF EXISTS "stripe_payouts_enabled";
--> statement-breakpoint
ALTER TABLE "tenants" DROP COLUMN IF EXISTS "stripe_onboarding_status";
--> statement-breakpoint
ALTER TABLE "tenants" DROP COLUMN IF EXISTS "stripe_requirements_due";
--> statement-breakpoint
ALTER TABLE "tenants" DROP CONSTRAINT IF EXISTS "tenants_stripe_onboarding_status_chk";
--> statement-breakpoint
-- ─── GRANT (brands already granted in 0013; restate to cover new columns) ────
DO $grant$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'resto_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON TABLE brands TO resto_app';
  END IF;
END
$grant$;
