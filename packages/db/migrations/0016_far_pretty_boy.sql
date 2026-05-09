CREATE TABLE "member_brand_scope" (
	"member_id" text NOT NULL,
	"brand_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"role" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "member_brand_scope_pk" PRIMARY KEY("member_id","brand_id")
);
--> statement-breakpoint
ALTER TABLE "member_brand_scope" ADD CONSTRAINT "member_brand_scope_member_fk" FOREIGN KEY ("member_id") REFERENCES "public"."member"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_brand_scope" ADD CONSTRAINT "member_brand_scope_brand_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_brand_scope" ADD CONSTRAINT "member_brand_scope_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "member_brand_scope_brand_idx" ON "member_brand_scope" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "member_brand_scope_tenant_idx" ON "member_brand_scope" USING btree ("tenant_id");