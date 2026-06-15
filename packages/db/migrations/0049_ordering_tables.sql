CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"order_number" text NOT NULL,
	"status" text NOT NULL,
	"fulfillment_mode" text NOT NULL,
	"table_identifier" text,
	"customer_name" text,
	"customer_phone" text,
	"subtotal" numeric(12, 2) NOT NULL,
	"delivery_fee" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"service_fee" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"discount" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"total" numeric(12, 2) NOT NULL,
	"currency" text NOT NULL,
	"scheduled_for" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_status_chk" CHECK ("orders"."status" IN ('created','paid','accepted','preparing','ready','completed','canceled','refunded','failed')),
	CONSTRAINT "orders_fulfillment_mode_chk" CHECK ("orders"."fulfillment_mode" IN ('dine_in','pickup','delivery'))
);
--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_brand_fk" FOREIGN KEY ("brand_id", "tenant_id") REFERENCES "public"."brands"("id", "tenant_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "orders_idempotency_key_uq" ON "orders" USING btree ("tenant_id","idempotency_key");
--> statement-breakpoint
CREATE UNIQUE INDEX "orders_id_tenant_uq" ON "orders" USING btree ("id","tenant_id");
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"menu_item_id" uuid NOT NULL,
	"name_snapshot" text NOT NULL,
	"unit_price" numeric(12, 2) NOT NULL,
	"quantity" smallint DEFAULT 1 NOT NULL,
	"line_total" numeric(12, 2) NOT NULL,
	"currency" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_fk" FOREIGN KEY ("order_id", "tenant_id") REFERENCES "public"."orders"("id", "tenant_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "order_items_id_tenant_uq" ON "order_items" USING btree ("id","tenant_id");
--> statement-breakpoint
CREATE TABLE "order_modifiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"order_item_id" uuid NOT NULL,
	"option_id" uuid NOT NULL,
	"name_snapshot" text NOT NULL,
	"price_delta" numeric(12, 2) NOT NULL,
	"amount" smallint DEFAULT 1 NOT NULL,
	"modifier_group_id" uuid
);
--> statement-breakpoint
ALTER TABLE "order_modifiers" ADD CONSTRAINT "order_modifiers_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "order_modifiers" ADD CONSTRAINT "order_modifiers_order_item_fk" FOREIGN KEY ("order_item_id", "tenant_id") REFERENCES "public"."order_items"("id", "tenant_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"status" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"currency" text NOT NULL,
	"provider" text DEFAULT 'stripe' NOT NULL,
	"provider_payment_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_status_chk" CHECK ("payments"."status" IN ('pending','succeeded','failed','refunded'))
);
--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_fk" FOREIGN KEY ("order_id", "tenant_id") REFERENCES "public"."orders"("id", "tenant_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "orders" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "orders" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "orders_iso" ON "orders"
  USING (is_system_session() OR tenant_id = current_tenant_id())
  WITH CHECK (is_system_session() OR tenant_id = current_tenant_id());
--> statement-breakpoint
ALTER TABLE "order_items" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "order_items" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "order_items_iso" ON "order_items"
  USING (is_system_session() OR tenant_id = current_tenant_id())
  WITH CHECK (is_system_session() OR tenant_id = current_tenant_id());
--> statement-breakpoint
ALTER TABLE "order_modifiers" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "order_modifiers" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "order_modifiers_iso" ON "order_modifiers"
  USING (is_system_session() OR tenant_id = current_tenant_id())
  WITH CHECK (is_system_session() OR tenant_id = current_tenant_id());
--> statement-breakpoint
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "payments" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "payments_iso" ON "payments"
  USING (is_system_session() OR tenant_id = current_tenant_id())
  WITH CHECK (is_system_session() OR tenant_id = current_tenant_id());
--> statement-breakpoint
