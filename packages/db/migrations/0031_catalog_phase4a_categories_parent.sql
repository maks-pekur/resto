-- Phase 4a-02 step D: add parent_id to menu_categories for iiko Группа tree.
-- D-4a-01 (iiko alignment). ADR-0020 I-2: composite tenant FK.

ALTER TABLE menu_categories ADD COLUMN parent_id uuid;
--> statement-breakpoint
ALTER TABLE menu_categories ADD CONSTRAINT menu_categories_parent_fk FOREIGN KEY (parent_id, tenant_id) REFERENCES menu_categories(id, tenant_id) ON DELETE RESTRICT;
--> statement-breakpoint
