-- 0063_locations.sql
-- Phase 08.4 (D-01/D-05): `locations` table — child of `brands`, composite FK
-- (brand_id, tenant_id) -> brands(id, tenant_id) with onDelete restrict
-- (locations are never hard-deleted; soft-archive only via status column).
--
-- RLS: brand-grain RESTRICTIVE policy reusing the existing current_brand_id()
-- GUC reader from 0058_brand_rls.sql — no new SQL function needed for this
-- table (locations are directly brand_id NOT NULL, same as menu_categories).

CREATE TABLE "locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"timezone" text,
	"contacts" jsonb,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "locations_status_chk" CHECK ("locations"."status" IN ('active','archived'))
);
--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_brand_fk" FOREIGN KEY ("brand_id","tenant_id") REFERENCES "public"."brands"("id","tenant_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "locations_id_tenant_uq" ON "locations" USING btree ("id","tenant_id");
--> statement-breakpoint
ALTER TABLE "locations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "locations" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY locations_brand_iso ON locations
  AS RESTRICTIVE
  USING (is_system_session() OR current_brand_id() IS NULL OR brand_id = current_brand_id())
  WITH CHECK (is_system_session() OR current_brand_id() IS NULL OR brand_id = current_brand_id());
