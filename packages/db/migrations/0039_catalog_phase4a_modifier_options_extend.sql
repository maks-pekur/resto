-- Phase 4a-04 step H: add default_amount + free_amount on menu_modifier_options.
-- D-4a CAT-04 (iiko NPModifierModel.default_amount + free_of_charge_amount).

ALTER TABLE menu_modifier_options ADD COLUMN default_amount smallint NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE menu_modifier_options ADD COLUMN free_amount smallint NOT NULL DEFAULT 0;
