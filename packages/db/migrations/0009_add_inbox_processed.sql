-- =============================================================================
-- Inbox-side dedup ledger (RES-116).
--
-- Per (event_id, consumer) record indicating an event has been
-- successfully processed. NATS JetStream is at-least-once: a consumer
-- restart between handler success and ack will redeliver, and N replicas
-- of the same consumer can each see the same envelope. This table makes
-- handlers idempotent across redeliveries and across replicas.
--
-- Mirrors the outbox RLS shape: tenant_id is nullable for platform
-- events; only system-context callers (the consumer worker) read or
-- write the table. Records are immutable — no UPDATE policy.
-- =============================================================================

CREATE TABLE inbox_processed (
  event_id uuid NOT NULL,
  consumer text NOT NULL,
  tenant_id uuid,
  processed_at timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (event_id, consumer)
);
--> statement-breakpoint
CREATE INDEX inbox_processed_consumer_processed_at_idx
  ON inbox_processed (consumer, processed_at);
--> statement-breakpoint
ALTER TABLE inbox_processed ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE inbox_processed FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY inbox_processed_select_iso ON inbox_processed
  FOR SELECT
  USING (is_system_session());
--> statement-breakpoint
CREATE POLICY inbox_processed_insert_iso ON inbox_processed
  FOR INSERT
  WITH CHECK (is_system_session());
--> statement-breakpoint
CREATE POLICY inbox_processed_delete_iso ON inbox_processed
  FOR DELETE
  USING (is_system_session());
-- UPDATE: no policy → denied for all callers. The table is append-only;
-- a future retention migration will sweep old rows via DELETE.
