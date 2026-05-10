CREATE TABLE "brands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"slug" "citext" NOT NULL,
	"display_name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"locale" text,
	"default_currency" text,
	"theme" jsonb,
	"legal_name" text,
	"legal_form" text,
	"tax_id" text,
	"stripe_account_id" text,
	"fiscalization_config" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "brands_status_chk" CHECK ("brands"."status" IN ('active','suspended','archived','erased')),
	CONSTRAINT "brands_legal_form_chk" CHECK ("brands"."legal_form" IS NULL OR "brands"."legal_form" IN ('IP','OOO','LLC','SOLE_PROP','OTHER')),
	CONSTRAINT "brands_slug_format_chk" CHECK ("brands"."slug" ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$'),
	CONSTRAINT "brands_currency_format_chk" CHECK ("brands"."default_currency" IS NULL OR "brands"."default_currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "brands_locale_format_chk" CHECK ("brands"."locale" IS NULL OR "brands"."locale" ~ '^[a-z]{2}(-[A-Z]{2})?$')
);
--> statement-breakpoint
ALTER TABLE "brands" ADD CONSTRAINT "brands_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "brands_tenant_slug_uq" ON "brands" USING btree ("tenant_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "brands_slug_active_uq" ON "brands" USING btree ("slug") WHERE "brands"."status" != 'erased';--> statement-breakpoint
CREATE INDEX "brands_tenant_status_idx" ON "brands" USING btree ("tenant_id","status");
