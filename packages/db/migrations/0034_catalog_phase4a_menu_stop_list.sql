-- Phase 4a-03 step E: create menu_stop_list (separate-table stop-list per D-4a-10).
-- Researcher's recommendation in SCHEMA-MAP §Q5: separate table over column or Redis.
-- ADR-0020 I-2: composite tenant FK. CAT-06.

CREATE TABLE "menu_stop_list" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"brand_id" uuid,
	"item_id" uuid NOT NULL,
	"stopped_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reason" text,
	"stopped_by_user_id" text
);
--> statement-breakpoint
ALTER TABLE "menu_stop_list" ADD CONSTRAINT "menu_stop_list_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "menu_stop_list" ADD CONSTRAINT "menu_stop_list_item_fk" FOREIGN KEY ("item_id", "tenant_id") REFERENCES "public"."menu_items"("id", "tenant_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "menu_stop_list_item_tenant_uq" ON "menu_stop_list" USING btree ("tenant_id","item_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "menu_stop_list_id_tenant_uq" ON "menu_stop_list" USING btree ("id","tenant_id");
--> statement-breakpoint
