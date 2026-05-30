-- Phase 4a-04 step G: rename menu_modifiers → menu_modifier_groups; cascade FK rename in menu_modifier_options + junction.
-- D-4a CAT-04 (iiko Группа модификаторов alignment). RESEARCH.md Pitfall 3: hand-written rename.

ALTER TABLE menu_modifier_options DROP CONSTRAINT menu_modifier_options_modifier_fk;
--> statement-breakpoint
ALTER TABLE menu_modifier_options DROP CONSTRAINT menu_modifier_options_tenant_fk;
--> statement-breakpoint
ALTER TABLE menu_item_modifiers DROP CONSTRAINT menu_item_modifiers_modifier_fk;
--> statement-breakpoint
ALTER TABLE menu_item_modifiers DROP CONSTRAINT menu_item_modifiers_item_fk;
--> statement-breakpoint
ALTER TABLE menu_item_modifiers DROP CONSTRAINT menu_item_modifiers_tenant_fk;
--> statement-breakpoint
ALTER TABLE menu_modifiers DROP CONSTRAINT menu_modifiers_tenant_fk;
--> statement-breakpoint
ALTER TABLE menu_modifiers RENAME TO menu_modifier_groups;
--> statement-breakpoint
ALTER TABLE menu_item_modifiers RENAME TO menu_item_modifier_groups;
--> statement-breakpoint
ALTER TABLE menu_modifier_options RENAME COLUMN modifier_id TO modifier_group_id;
--> statement-breakpoint
ALTER TABLE menu_item_modifier_groups RENAME COLUMN modifier_id TO modifier_group_id;
--> statement-breakpoint
ALTER INDEX menu_modifiers_id_tenant_uq RENAME TO menu_modifier_groups_id_tenant_uq;
--> statement-breakpoint
ALTER TABLE menu_modifier_groups RENAME CONSTRAINT menu_modifiers_selectable_range_chk TO menu_modifier_groups_selectable_range_chk;
--> statement-breakpoint
ALTER INDEX menu_modifier_options_tenant_modifier_idx RENAME TO menu_modifier_options_tenant_group_idx;
--> statement-breakpoint
ALTER INDEX menu_item_modifiers_tenant_item_idx RENAME TO menu_item_modifier_groups_tenant_item_idx;
--> statement-breakpoint
ALTER TABLE menu_item_modifier_groups RENAME CONSTRAINT menu_item_modifiers_pk TO menu_item_modifier_groups_pk;
--> statement-breakpoint
ALTER TABLE menu_modifier_groups
  ADD CONSTRAINT menu_modifier_groups_tenant_fk
  FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE menu_modifier_options
  ADD CONSTRAINT menu_modifier_options_tenant_fk
  FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE menu_modifier_options
  ADD CONSTRAINT menu_modifier_options_group_fk
  FOREIGN KEY (modifier_group_id, tenant_id) REFERENCES menu_modifier_groups (id, tenant_id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE menu_item_modifier_groups
  ADD CONSTRAINT menu_item_modifier_groups_tenant_fk
  FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE menu_item_modifier_groups
  ADD CONSTRAINT menu_item_modifier_groups_item_fk
  FOREIGN KEY (menu_item_id, tenant_id) REFERENCES menu_items (id, tenant_id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE menu_item_modifier_groups
  ADD CONSTRAINT menu_item_modifier_groups_group_fk
  FOREIGN KEY (modifier_group_id, tenant_id) REFERENCES menu_modifier_groups (id, tenant_id) ON DELETE CASCADE;
