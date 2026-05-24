-- RES-236 Phase 3b: composite tenant FK for remaining tenant-scoped children.
-- ADR-0020 I-2: every tenant-scoped child with parent_id must reference
-- parent(id, tenant_id) so cross-tenant phantom rows are structurally
-- impossible. Phase 3a delivered the helpers + brand_domains PoC; this
-- migration applies the same pattern to the remaining children.

CREATE UNIQUE INDEX menu_categories_id_tenant_uq ON menu_categories (id, tenant_id);
--> statement-breakpoint
CREATE UNIQUE INDEX menu_items_id_tenant_uq ON menu_items (id, tenant_id);
--> statement-breakpoint
CREATE UNIQUE INDEX menu_modifiers_id_tenant_uq ON menu_modifiers (id, tenant_id);
--> statement-breakpoint

ALTER TABLE member_brand_scope DROP CONSTRAINT member_brand_scope_brand_fk;
--> statement-breakpoint
ALTER TABLE member_brand_scope
  ADD CONSTRAINT member_brand_scope_brand_fk
  FOREIGN KEY (brand_id, tenant_id) REFERENCES brands (id, tenant_id) ON DELETE CASCADE;
--> statement-breakpoint

ALTER TABLE menu_items DROP CONSTRAINT menu_items_category_fk;
--> statement-breakpoint
ALTER TABLE menu_items
  ADD CONSTRAINT menu_items_category_fk
  FOREIGN KEY (category_id, tenant_id) REFERENCES menu_categories (id, tenant_id) ON DELETE RESTRICT;
--> statement-breakpoint

ALTER TABLE menu_variants DROP CONSTRAINT menu_variants_item_fk;
--> statement-breakpoint
ALTER TABLE menu_variants
  ADD CONSTRAINT menu_variants_item_fk
  FOREIGN KEY (menu_item_id, tenant_id) REFERENCES menu_items (id, tenant_id) ON DELETE CASCADE;
--> statement-breakpoint

ALTER TABLE menu_modifier_options DROP CONSTRAINT menu_modifier_options_modifier_fk;
--> statement-breakpoint
ALTER TABLE menu_modifier_options
  ADD CONSTRAINT menu_modifier_options_modifier_fk
  FOREIGN KEY (modifier_id, tenant_id) REFERENCES menu_modifiers (id, tenant_id) ON DELETE CASCADE;
--> statement-breakpoint

ALTER TABLE menu_item_modifiers DROP CONSTRAINT menu_item_modifiers_item_fk;
--> statement-breakpoint
ALTER TABLE menu_item_modifiers
  ADD CONSTRAINT menu_item_modifiers_item_fk
  FOREIGN KEY (menu_item_id, tenant_id) REFERENCES menu_items (id, tenant_id) ON DELETE CASCADE;
--> statement-breakpoint

ALTER TABLE menu_item_modifiers DROP CONSTRAINT menu_item_modifiers_modifier_fk;
--> statement-breakpoint
ALTER TABLE menu_item_modifiers
  ADD CONSTRAINT menu_item_modifiers_modifier_fk
  FOREIGN KEY (modifier_id, tenant_id) REFERENCES menu_modifiers (id, tenant_id) ON DELETE CASCADE;
