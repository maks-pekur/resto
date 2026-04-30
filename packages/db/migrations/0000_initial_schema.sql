-- Postgres extensions required by the schema. Idempotent.
-- pgcrypto: gen_random_uuid() default for primary keys.
-- citext:   case-insensitive text used for slugs, emails, domains.
-- pg_trgm:  trigram search for menu item names (kept for future use).
CREATE EXTENSION IF NOT EXISTS pgcrypto;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS citext;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE TABLE "tenant_domains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"domain" "citext" NOT NULL,
	"kind" text NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "tenant_domains_kind_chk" CHECK ("tenant_domains"."kind" IN ('subdomain', 'custom'))
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" "citext" NOT NULL,
	"display_name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"default_currency" text DEFAULT 'USD' NOT NULL,
	"stripe_account_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "tenants_status_chk" CHECK ("tenants"."status" IN ('active', 'suspended', 'archived')),
	CONSTRAINT "tenants_slug_format_chk" CHECK ("tenants"."slug" ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$'),
	CONSTRAINT "tenants_currency_format_chk" CHECK ("tenants"."default_currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "tenants_locale_format_chk" CHECK ("tenants"."locale" ~ '^[a-z]{2}(-[A-Z]{2})?$')
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"keycloak_subject" text NOT NULL,
	"email" "citext" NOT NULL,
	"display_name" text,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "users_role_chk" CHECK ("users"."role" IN ('owner', 'manager', 'kitchen', 'waiter')),
	CONSTRAINT "users_email_format_chk" CHECK ("users"."email" ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$')
);
--> statement-breakpoint
CREATE TABLE "menu_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" jsonb NOT NULL,
	"description" jsonb,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "menu_categories_slug_format_chk" CHECK ("menu_categories"."slug" ~ '^[a-z0-9][a-z0-9-]*$')
);
--> statement-breakpoint
CREATE TABLE "menu_item_modifiers" (
	"tenant_id" uuid NOT NULL,
	"menu_item_id" uuid NOT NULL,
	"modifier_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "menu_item_modifiers_pk" PRIMARY KEY("menu_item_id","modifier_id")
);
--> statement-breakpoint
CREATE TABLE "menu_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" jsonb NOT NULL,
	"description" jsonb,
	"base_price" numeric(12, 2) NOT NULL,
	"currency" text NOT NULL,
	"image_s3_key" text,
	"allergens" text[],
	"status" text DEFAULT 'draft' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "menu_items_status_chk" CHECK ("menu_items"."status" IN ('draft', 'published', 'archived')),
	CONSTRAINT "menu_items_currency_format_chk" CHECK ("menu_items"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "menu_items_base_price_nonneg_chk" CHECK ("menu_items"."base_price"::numeric >= 0),
	CONSTRAINT "menu_items_slug_format_chk" CHECK ("menu_items"."slug" ~ '^[a-z0-9][a-z0-9-]*$')
);
--> statement-breakpoint
CREATE TABLE "menu_modifier_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"modifier_id" uuid NOT NULL,
	"name" jsonb NOT NULL,
	"price_delta" numeric(12, 2) DEFAULT '0' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "menu_modifiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" jsonb NOT NULL,
	"min_selectable" integer DEFAULT 0 NOT NULL,
	"max_selectable" integer DEFAULT 1 NOT NULL,
	"is_required" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "menu_modifiers_selectable_range_chk" CHECK ("menu_modifiers"."min_selectable" >= 0 AND "menu_modifiers"."max_selectable" >= "menu_modifiers"."min_selectable")
);
--> statement-breakpoint
CREATE TABLE "menu_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"menu_item_id" uuid NOT NULL,
	"name" jsonb NOT NULL,
	"price_delta" numeric(12, 2) DEFAULT '0' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"actor_kind" text NOT NULL,
	"actor_subject" text NOT NULL,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"payload" jsonb,
	"ip_address" text,
	"user_agent" text,
	"correlation_id" uuid,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_log_actor_kind_chk" CHECK ("audit_log"."actor_kind" IN ('platform_user', 'tenant_user', 'system', 'service'))
);
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_categories" ADD CONSTRAINT "menu_categories_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_item_modifiers" ADD CONSTRAINT "menu_item_modifiers_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_item_modifiers" ADD CONSTRAINT "menu_item_modifiers_item_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_item_modifiers" ADD CONSTRAINT "menu_item_modifiers_modifier_fk" FOREIGN KEY ("modifier_id") REFERENCES "public"."menu_modifiers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_category_fk" FOREIGN KEY ("category_id") REFERENCES "public"."menu_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_modifier_options" ADD CONSTRAINT "menu_modifier_options_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_modifier_options" ADD CONSTRAINT "menu_modifier_options_modifier_fk" FOREIGN KEY ("modifier_id") REFERENCES "public"."menu_modifiers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_modifiers" ADD CONSTRAINT "menu_modifiers_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_variants" ADD CONSTRAINT "menu_variants_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_variants" ADD CONSTRAINT "menu_variants_item_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_domains_domain_uq" ON "tenant_domains" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "tenant_domains_tenant_idx" ON "tenant_domains" USING btree ("tenant_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_domains_one_primary_per_tenant_uq" ON "tenant_domains" USING btree ("tenant_id") WHERE "tenant_domains"."is_primary" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "tenants_slug_uq" ON "tenants" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "users_tenant_keycloak_uq" ON "users" USING btree ("tenant_id","keycloak_subject");--> statement-breakpoint
CREATE UNIQUE INDEX "users_tenant_email_uq" ON "users" USING btree ("tenant_id","email");--> statement-breakpoint
CREATE INDEX "users_tenant_role_idx" ON "users" USING btree ("tenant_id","role");--> statement-breakpoint
CREATE UNIQUE INDEX "menu_categories_tenant_slug_uq" ON "menu_categories" USING btree ("tenant_id","slug");--> statement-breakpoint
CREATE INDEX "menu_categories_tenant_sort_idx" ON "menu_categories" USING btree ("tenant_id","sort_order");--> statement-breakpoint
CREATE INDEX "menu_item_modifiers_tenant_item_idx" ON "menu_item_modifiers" USING btree ("tenant_id","menu_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "menu_items_tenant_slug_uq" ON "menu_items" USING btree ("tenant_id","slug");--> statement-breakpoint
CREATE INDEX "menu_items_tenant_category_status_idx" ON "menu_items" USING btree ("tenant_id","category_id","status");--> statement-breakpoint
CREATE INDEX "menu_items_tenant_status_sort_idx" ON "menu_items" USING btree ("tenant_id","status","sort_order");--> statement-breakpoint
CREATE INDEX "menu_modifier_options_tenant_modifier_idx" ON "menu_modifier_options" USING btree ("tenant_id","modifier_id","sort_order");--> statement-breakpoint
CREATE INDEX "menu_variants_tenant_item_idx" ON "menu_variants" USING btree ("tenant_id","menu_item_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "menu_variants_one_default_per_item_uq" ON "menu_variants" USING btree ("menu_item_id") WHERE "menu_variants"."is_default" = true;--> statement-breakpoint
CREATE INDEX "audit_log_tenant_occurred_idx" ON "audit_log" USING btree ("tenant_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_log_actor_occurred_idx" ON "audit_log" USING btree ("actor_subject","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_log_action_occurred_idx" ON "audit_log" USING btree ("action","occurred_at");