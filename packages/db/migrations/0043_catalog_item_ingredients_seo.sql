-- Item editor redesign (2026-06-02): add ingredients (text[]) + SEO meta_title/meta_description (text).
-- All three columns are nullable, no defaults — additive change so it can ship ahead of consumers.

ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS ingredients text[];
--> statement-breakpoint
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS meta_title text;
--> statement-breakpoint
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS meta_description text;
