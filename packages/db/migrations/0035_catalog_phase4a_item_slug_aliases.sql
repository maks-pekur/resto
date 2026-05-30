-- Phase 4a-03 step I: create menu_item_slug_aliases (D-4a-04 slug history + SEO redirect).
-- ADR-0020 I-2: composite tenant FK. Plan 06 wires alias insertion in upsert-item.service.ts. CAT-09.

CREATE TABLE "menu_item_slug_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"alias" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "menu_item_slug_aliases_format_chk" CHECK ("menu_item_slug_aliases"."alias" ~ '^[a-z0-9][a-z0-9-]*$')
);
--> statement-breakpoint
ALTER TABLE "menu_item_slug_aliases" ADD CONSTRAINT "menu_item_slug_aliases_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "menu_item_slug_aliases" ADD CONSTRAINT "menu_item_slug_aliases_item_fk" FOREIGN KEY ("item_id", "tenant_id") REFERENCES "public"."menu_items"("id", "tenant_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "menu_item_slug_aliases_tenant_alias_uq" ON "menu_item_slug_aliases" USING btree ("tenant_id","alias");
--> statement-breakpoint
CREATE UNIQUE INDEX "menu_item_slug_aliases_id_tenant_uq" ON "menu_item_slug_aliases" USING btree ("id","tenant_id");
--> statement-breakpoint
