CREATE TABLE "brand_domains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"domain" "citext" NOT NULL,
	"kind" text NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "brand_domains_kind_chk" CHECK ("brand_domains"."kind" IN ('subdomain', 'custom'))
);
--> statement-breakpoint
ALTER TABLE "brand_domains" ADD CONSTRAINT "brand_domains_brand_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_domains" ADD CONSTRAINT "brand_domains_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "brand_domains_domain_uq" ON "brand_domains" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "brand_domains_brand_kind_idx" ON "brand_domains" USING btree ("brand_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "brand_domains_one_primary_per_brand_uq" ON "brand_domains" USING btree ("brand_id") WHERE "brand_domains"."is_primary" = true;