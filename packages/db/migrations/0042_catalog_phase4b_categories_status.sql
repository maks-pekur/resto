-- Phase 4b D-4b-07: add status to menu_categories. UI needs same badge surface as items + archive flow.
-- Backfill existing rows to 'published' (they are already visible by definition pre-status).

ALTER TABLE menu_categories ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft';
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'menu_categories_status_chk'
  ) THEN
    ALTER TABLE menu_categories
      ADD CONSTRAINT menu_categories_status_chk CHECK (status IN ('draft','published','archived'));
  END IF;
END $$;
--> statement-breakpoint
UPDATE menu_categories SET status = 'published' WHERE status = 'draft';
--> statement-breakpoint
