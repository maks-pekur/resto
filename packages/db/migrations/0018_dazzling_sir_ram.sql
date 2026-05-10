ALTER TABLE "menu_categories" ADD COLUMN "brand_id" uuid;--> statement-breakpoint
ALTER TABLE "menu_item_modifiers" ADD COLUMN "brand_id" uuid;--> statement-breakpoint
ALTER TABLE "menu_items" ADD COLUMN "brand_id" uuid;--> statement-breakpoint
ALTER TABLE "menu_modifier_options" ADD COLUMN "brand_id" uuid;--> statement-breakpoint
ALTER TABLE "menu_modifiers" ADD COLUMN "brand_id" uuid;--> statement-breakpoint
ALTER TABLE "menu_variants" ADD COLUMN "brand_id" uuid;--> statement-breakpoint
ALTER TABLE "outbox_events" ADD COLUMN "brand_id" uuid;--> statement-breakpoint
ALTER TABLE "customer_profiles" ADD COLUMN "brand_id" uuid;