CREATE TABLE "outbox_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"aggregate_id" uuid,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"headers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"claimed_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	CONSTRAINT "outbox_events_type_format_chk" CHECK ("outbox_events"."type" ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+\.v[0-9]+$')
);
--> statement-breakpoint
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "outbox_events_undelivered_idx" ON "outbox_events" USING btree ("occurred_at") WHERE delivered_at IS NULL;--> statement-breakpoint
CREATE INDEX "outbox_events_tenant_occurred_idx" ON "outbox_events" USING btree ("tenant_id","occurred_at");--> statement-breakpoint
CREATE INDEX "outbox_events_type_occurred_idx" ON "outbox_events" USING btree ("type","occurred_at");