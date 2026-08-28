-- Better Auth 1.6 added three fields to its `twoFactor` model. Without them the adapter refuses
-- every 2FA endpoint with "The field \"verified\" does not exist in the \"twoFactor\" Drizzle
-- schema", so enable / verify / disable all return 500.
--
-- Hand-written rather than generated: `meta/0000_snapshot.json` is missing (the phase 10.2 squash
-- kept the baseline SQL but not its snapshot), so `drizzle-kit generate` has nothing to diff
-- against and emits a full CREATE of every table instead of this ALTER.

ALTER TABLE "two_factor" ADD COLUMN IF NOT EXISTS "verified" boolean DEFAULT true;
--> statement-breakpoint
ALTER TABLE "two_factor" ADD COLUMN IF NOT EXISTS "failed_verification_count" integer DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "two_factor" ADD COLUMN IF NOT EXISTS "locked_until" timestamp with time zone;
--> statement-breakpoint

-- Backfill honestly rather than taking BA's `defaultValue: true`. Under 1.4.22 a `two_factor` row
-- appeared at `enable` and `user.two_factor_enabled` only flipped once a code verified, so an
-- abandoned enrolment is a row with the flag still false. Marking those `verified = true` would
-- promote a secret the operator never confirmed.
UPDATE "two_factor" AS tf
SET "verified" = COALESCE(u."two_factor_enabled", false)
FROM "user" AS u
WHERE u."id" = tf."user_id";
