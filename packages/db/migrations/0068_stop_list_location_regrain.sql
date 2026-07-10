-- 0068_stop_list_location_regrain.sql
-- Phase 08.4 Plan 06 (D-02): re-key menu_stop_list + catalog_brand_stop_version
-- from brand_id to location_id -- availability/stop-list moves to location
-- grain while menu items/categories/prices stay brand-level.
--
-- D-12/D-13/Pitfall 5: no locations exist yet in any environment with real
-- tenant data, and this migration must not synthesize one. The pre-existing
-- dev-only rows in these two tables (manual test data, not production) are
-- cleared rather than backfilled -- there is no location to legally
-- attribute them to. No `INSERT INTO locations` appears anywhere here.
--
-- The old brand_iso RESTRICTIVE policies on both tables reference brand_id,
-- which is either dropped or renamed below, so they must be dropped first.
-- The new location-grain policies land in 0069_stop_list_location_rls.sql.

DROP POLICY IF EXISTS menu_stop_list_brand_iso ON menu_stop_list;
--> statement-breakpoint
DROP POLICY IF EXISTS catalog_brand_stop_version_brand_iso ON catalog_brand_stop_version;
--> statement-breakpoint

DELETE FROM menu_stop_list;
--> statement-breakpoint
DELETE FROM catalog_brand_stop_version;
--> statement-breakpoint

ALTER TABLE menu_stop_list DROP CONSTRAINT menu_stop_list_brand_fk;
--> statement-breakpoint
DROP INDEX menu_stop_list_item_tenant_uq;
--> statement-breakpoint
ALTER TABLE menu_stop_list DROP COLUMN brand_id;
--> statement-breakpoint
ALTER TABLE menu_stop_list ADD COLUMN location_id uuid NOT NULL;
--> statement-breakpoint
ALTER TABLE menu_stop_list
  ADD CONSTRAINT menu_stop_list_location_fk
  FOREIGN KEY (location_id, tenant_id) REFERENCES locations (id, tenant_id) ON DELETE RESTRICT;
--> statement-breakpoint
CREATE UNIQUE INDEX menu_stop_list_location_item_tenant_uq ON menu_stop_list (tenant_id, location_id, item_id);
--> statement-breakpoint

ALTER TABLE catalog_brand_stop_version RENAME TO catalog_location_stop_version;
--> statement-breakpoint
ALTER TABLE catalog_location_stop_version DROP CONSTRAINT catalog_brand_stop_version_brand_fk;
--> statement-breakpoint
ALTER TABLE catalog_location_stop_version DROP CONSTRAINT catalog_brand_stop_version_pk;
--> statement-breakpoint
ALTER TABLE catalog_location_stop_version RENAME COLUMN brand_id TO location_id;
--> statement-breakpoint
ALTER TABLE catalog_location_stop_version
  RENAME CONSTRAINT catalog_brand_stop_version_tenant_fk TO catalog_location_stop_version_tenant_fk;
--> statement-breakpoint
ALTER TABLE catalog_location_stop_version
  ADD CONSTRAINT catalog_location_stop_version_pk PRIMARY KEY (location_id, tenant_id);
--> statement-breakpoint
ALTER TABLE catalog_location_stop_version
  ADD CONSTRAINT catalog_location_stop_version_location_fk
  FOREIGN KEY (location_id, tenant_id) REFERENCES locations (id, tenant_id) ON DELETE RESTRICT;
