-- Phase 4a-02 step C: drop image_s3_key after backfill into photos[0].
-- D-4a-02. Forward-only migration; zero paying customers per STATE.md.

ALTER TABLE menu_items DROP COLUMN image_s3_key;
--> statement-breakpoint
