ALTER TABLE "menu_categories" ADD COLUMN "code" text;
--> statement-breakpoint
ALTER TABLE "menu_items" ADD COLUMN "code" text;
--> statement-breakpoint
ALTER TABLE "menu_items" ADD COLUMN "weight" numeric(10,3);
--> statement-breakpoint
ALTER TABLE "menu_items" ADD COLUMN "measure_unit" text;
--> statement-breakpoint
ALTER TABLE "menu_modifier_options" ADD COLUMN "min_amount" smallint;
--> statement-breakpoint
ALTER TABLE "menu_modifier_options" ADD COLUMN "max_amount" smallint;
--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_weight_nonneg_chk" CHECK (weight IS NULL OR weight >= 0);
--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_measure_unit_chk" CHECK (measure_unit IS NULL OR measure_unit IN ('g','kg','ml','l','pcs'));
--> statement-breakpoint
ALTER TABLE "menu_modifier_options" ADD CONSTRAINT "menu_modifier_options_amount_nonneg_chk" CHECK (min_amount IS NULL OR min_amount >= 0);
--> statement-breakpoint
ALTER TABLE "menu_modifier_options" ADD CONSTRAINT "menu_modifier_options_amount_order_chk" CHECK (min_amount IS NULL OR max_amount IS NULL OR max_amount >= min_amount);
--> statement-breakpoint
CREATE UNIQUE INDEX "menu_categories_brand_code_uq" ON "menu_categories" ("tenant_id","brand_id","code") WHERE code IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "menu_items_brand_code_uq" ON "menu_items" ("tenant_id","brand_id","code") WHERE code IS NOT NULL;
