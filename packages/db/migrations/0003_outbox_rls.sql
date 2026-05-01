-- =============================================================================
-- Row-Level Security for the transactional outbox.
--
-- Tenant context can append events for its own tenant (or platform-level
-- events with `tenant_id IS NULL`). Reads, claims, and delivery marking
-- are restricted to system context — only the dispatcher (running under
-- `withoutTenant`) operates on the table.
--
-- Mirrors the pattern in `audit_log` (see 0001_rls_policies.sql).
-- =============================================================================

ALTER TABLE outbox_events ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE outbox_events FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY outbox_events_read_iso ON outbox_events
  FOR SELECT
  USING (is_system_session());
--> statement-breakpoint
CREATE POLICY outbox_events_insert_iso ON outbox_events
  FOR INSERT
  WITH CHECK (
    is_system_session()
    OR tenant_id IS NULL
    OR tenant_id = current_tenant_id()
  );
--> statement-breakpoint
CREATE POLICY outbox_events_update_iso ON outbox_events
  FOR UPDATE
  USING (is_system_session())
  WITH CHECK (is_system_session());
-- DELETE: no policy → denied for all callers. Dispatcher does not delete;
-- a future GC migration will introduce one with a system-only policy.
