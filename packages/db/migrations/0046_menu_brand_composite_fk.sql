ALTER TABLE "menu_categories" ADD CONSTRAINT "menu_categories_brand_fk"
  FOREIGN KEY ("brand_id", "tenant_id") REFERENCES "brands"("id", "tenant_id") ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_brand_fk"
  FOREIGN KEY ("brand_id", "tenant_id") REFERENCES "brands"("id", "tenant_id") ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE "menu_item_sizes" ADD CONSTRAINT "menu_item_sizes_brand_fk"
  FOREIGN KEY ("brand_id", "tenant_id") REFERENCES "brands"("id", "tenant_id") ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE "menu_modifier_groups" ADD CONSTRAINT "menu_modifier_groups_brand_fk"
  FOREIGN KEY ("brand_id", "tenant_id") REFERENCES "brands"("id", "tenant_id") ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE "menu_modifier_options" ADD CONSTRAINT "menu_modifier_options_brand_fk"
  FOREIGN KEY ("brand_id", "tenant_id") REFERENCES "brands"("id", "tenant_id") ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE "menu_item_modifier_groups" ADD CONSTRAINT "menu_item_modifier_groups_brand_fk"
  FOREIGN KEY ("brand_id", "tenant_id") REFERENCES "brands"("id", "tenant_id") ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE "menu_stop_list" ADD CONSTRAINT "menu_stop_list_brand_fk"
  FOREIGN KEY ("brand_id", "tenant_id") REFERENCES "brands"("id", "tenant_id") ON DELETE RESTRICT;
