-- Phase 4a-02 step A: extend menu_items with photos + BJU + source provenance.
-- D-4a-01 (source enum), D-4a-02 (photos JSONB), D-4a-03 (structured BJU). CAT-02.

ALTER TABLE menu_items ADD COLUMN photos jsonb NOT NULL DEFAULT '[]'::jsonb;
--> statement-breakpoint
ALTER TABLE menu_items ADD COLUMN proteins numeric(5,2);
--> statement-breakpoint
ALTER TABLE menu_items ADD COLUMN fats numeric(5,2);
--> statement-breakpoint
ALTER TABLE menu_items ADD COLUMN carbs numeric(5,2);
--> statement-breakpoint
ALTER TABLE menu_items ADD COLUMN kcal smallint;
--> statement-breakpoint
ALTER TABLE menu_items ADD COLUMN nutrition_estimated boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE menu_items ADD COLUMN source text NOT NULL DEFAULT 'manual';
--> statement-breakpoint
ALTER TABLE menu_items ADD COLUMN needs_review boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE menu_items ADD COLUMN source_external_id text;
--> statement-breakpoint
ALTER TABLE menu_items ADD CONSTRAINT menu_items_source_chk CHECK (source IN ('manual', 'ai_generated', 'imported_iiko', 'imported_csv'));
--> statement-breakpoint
-- D-4a-02 backfill: move legacy single image_s3_key into photos[0] before the column is dropped in 0030.
UPDATE menu_items SET photos = jsonb_build_array(jsonb_build_object('s3Key', image_s3_key, 'sortOrder', 0, 'isPrimary', true)) WHERE image_s3_key IS NOT NULL AND image_s3_key <> '';
--> statement-breakpoint
