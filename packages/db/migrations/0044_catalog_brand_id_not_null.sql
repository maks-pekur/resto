UPDATE "menu_categories" mc SET "brand_id" = (SELECT b."id" FROM "brands" b WHERE b."tenant_id" = mc."tenant_id" ORDER BY b."created_at" LIMIT 1) WHERE mc."brand_id" IS NULL;
--> statement-breakpoint
UPDATE "menu_items" mi SET "brand_id" = (SELECT b."id" FROM "brands" b WHERE b."tenant_id" = mi."tenant_id" ORDER BY b."created_at" LIMIT 1) WHERE mi."brand_id" IS NULL;
--> statement-breakpoint
UPDATE "menu_item_sizes" ms SET "brand_id" = (SELECT b."id" FROM "brands" b WHERE b."tenant_id" = ms."tenant_id" ORDER BY b."created_at" LIMIT 1) WHERE ms."brand_id" IS NULL;
--> statement-breakpoint
UPDATE "menu_modifier_groups" mg SET "brand_id" = (SELECT b."id" FROM "brands" b WHERE b."tenant_id" = mg."tenant_id" ORDER BY b."created_at" LIMIT 1) WHERE mg."brand_id" IS NULL;
--> statement-breakpoint
UPDATE "menu_modifier_options" mo SET "brand_id" = (SELECT b."id" FROM "brands" b WHERE b."tenant_id" = mo."tenant_id" ORDER BY b."created_at" LIMIT 1) WHERE mo."brand_id" IS NULL;
--> statement-breakpoint
UPDATE "menu_item_modifier_groups" mig SET "brand_id" = (SELECT b."id" FROM "brands" b WHERE b."tenant_id" = mig."tenant_id" ORDER BY b."created_at" LIMIT 1) WHERE mig."brand_id" IS NULL;
--> statement-breakpoint
UPDATE "menu_stop_list" msl SET "brand_id" = (SELECT b."id" FROM "brands" b WHERE b."tenant_id" = msl."tenant_id" ORDER BY b."created_at" LIMIT 1) WHERE msl."brand_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "menu_categories" ALTER COLUMN "brand_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "menu_items" ALTER COLUMN "brand_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "menu_item_sizes" ALTER COLUMN "brand_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "menu_modifier_groups" ALTER COLUMN "brand_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "menu_modifier_options" ALTER COLUMN "brand_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "menu_item_modifier_groups" ALTER COLUMN "brand_id" SET NOT NULL;
--> statement-breakpoint
DROP INDEX IF EXISTS "menu_categories_tenant_slug_uq";
--> statement-breakpoint
DROP INDEX IF EXISTS "menu_items_tenant_slug_uq";
--> statement-breakpoint
CREATE UNIQUE INDEX "menu_categories_brand_slug_uq" ON "menu_categories" USING btree ("tenant_id","brand_id","slug");
--> statement-breakpoint
CREATE UNIQUE INDEX "menu_items_brand_slug_uq" ON "menu_items" USING btree ("tenant_id","brand_id","slug");
