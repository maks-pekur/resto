-- 0064_member_location_scope.sql
-- Phase 08.4 (D-04): `member_location_scope` — supersedes ad-hoc per-location
-- role hacks; mirrors member_brand_scope's shape EXCEPT the location FK is
-- onDelete restrict (locations are never hard-deleted, RESEARCH A4).
--
-- RLS: Tier-3 — tenant-grain ONLY, no brand/location-grain policy. This
-- mirrors member_brand_scope, which is absent from the 9-table brand-policy
-- list in 0058_brand_rls.sql. Every tenant-scoped table already gets
-- baseline tenant-level RLS platform-wide; do not add a scoped policy here.

CREATE TABLE "member_location_scope" (
	"member_id" text NOT NULL,
	"location_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"role" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "member_location_scope_pk" PRIMARY KEY("member_id","location_id")
);
--> statement-breakpoint
ALTER TABLE "member_location_scope" ADD CONSTRAINT "member_location_scope_member_fk" FOREIGN KEY ("member_id") REFERENCES "public"."member"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "member_location_scope" ADD CONSTRAINT "member_location_scope_location_fk" FOREIGN KEY ("location_id","tenant_id") REFERENCES "public"."locations"("id","tenant_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "member_location_scope" ADD CONSTRAINT "member_location_scope_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "member_location_scope_location_idx" ON "member_location_scope" USING btree ("location_id");
--> statement-breakpoint
CREATE INDEX "member_location_scope_tenant_idx" ON "member_location_scope" USING btree ("tenant_id");
--> statement-breakpoint
ALTER TABLE "member_location_scope" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "member_location_scope" FORCE ROW LEVEL SECURITY;
