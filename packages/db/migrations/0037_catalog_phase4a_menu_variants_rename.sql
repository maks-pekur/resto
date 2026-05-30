-- Phase 4a-04 step F: rename menu_variants → menu_item_sizes; price_delta → absolute price.
-- D-4a CAT-05 (iiko NSizeModel alignment). RESEARCH.md A1 confirms all existing priceDelta = 0.
-- Pitfall 6: semantic change from delta to absolute. Plan 06 refactors repository.

ALTER TABLE menu_variants DROP CONSTRAINT menu_variants_tenant_fk;
--> statement-breakpoint
ALTER TABLE menu_variants DROP CONSTRAINT menu_variants_item_fk;
--> statement-breakpoint
ALTER INDEX menu_variants_tenant_item_idx RENAME TO menu_item_sizes_tenant_item_idx;
--> statement-breakpoint
ALTER INDEX menu_variants_one_default_per_item_uq RENAME TO menu_item_sizes_one_default_per_item_uq;
--> statement-breakpoint
ALTER INDEX menu_variants_id_tenant_uq RENAME TO menu_item_sizes_id_tenant_uq;
--> statement-breakpoint
ALTER TABLE menu_variants RENAME COLUMN price_delta TO price;
--> statement-breakpoint
ALTER TABLE menu_variants RENAME TO menu_item_sizes;
--> statement-breakpoint
UPDATE menu_item_sizes
SET price = mi.base_price
FROM menu_items mi
WHERE mi.id = menu_item_sizes.menu_item_id
  AND mi.tenant_id = menu_item_sizes.tenant_id
  AND (menu_item_sizes.price::numeric = 0 OR menu_item_sizes.price IS NULL);
--> statement-breakpoint
ALTER TABLE menu_item_sizes
  ADD CONSTRAINT menu_item_sizes_tenant_fk
  FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE menu_item_sizes
  ADD CONSTRAINT menu_item_sizes_item_fk
  FOREIGN KEY (menu_item_id, tenant_id) REFERENCES menu_items (id, tenant_id) ON DELETE CASCADE;
