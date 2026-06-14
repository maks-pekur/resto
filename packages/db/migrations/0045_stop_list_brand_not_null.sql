UPDATE "menu_stop_list" msl SET "brand_id" = (SELECT b."id" FROM "brands" b WHERE b."tenant_id" = msl."tenant_id" ORDER BY b."created_at" LIMIT 1) WHERE msl."brand_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "menu_stop_list" ALTER COLUMN "brand_id" SET NOT NULL;
