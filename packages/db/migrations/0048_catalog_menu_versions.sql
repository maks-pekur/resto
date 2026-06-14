CREATE TABLE "catalog_menu_version" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"menu_version" bigint DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_brand_stop_version" (
	"brand_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"stop_version" bigint DEFAULT 1 NOT NULL,
	CONSTRAINT "catalog_brand_stop_version_pk" PRIMARY KEY ("brand_id","tenant_id")
);
--> statement-breakpoint
ALTER TABLE "catalog_menu_version" ADD CONSTRAINT "catalog_menu_version_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "catalog_brand_stop_version" ADD CONSTRAINT "catalog_brand_stop_version_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "catalog_brand_stop_version" ADD CONSTRAINT "catalog_brand_stop_version_brand_fk" FOREIGN KEY ("brand_id", "tenant_id") REFERENCES "public"."brands"("id", "tenant_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "catalog_menu_version" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "catalog_menu_version" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "catalog_menu_version_iso" ON "catalog_menu_version"
  USING (is_system_session() OR tenant_id = current_tenant_id())
  WITH CHECK (is_system_session() OR tenant_id = current_tenant_id());
--> statement-breakpoint

ALTER TABLE "catalog_brand_stop_version" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "catalog_brand_stop_version" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "catalog_brand_stop_version_iso" ON "catalog_brand_stop_version"
  USING (is_system_session() OR tenant_id = current_tenant_id())
  WITH CHECK (is_system_session() OR tenant_id = current_tenant_id());
--> statement-breakpoint

INSERT INTO catalog_menu_version (tenant_id) SELECT id FROM tenants ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO catalog_brand_stop_version (brand_id, tenant_id) SELECT id, tenant_id FROM brands ON CONFLICT DO NOTHING;
--> statement-breakpoint
