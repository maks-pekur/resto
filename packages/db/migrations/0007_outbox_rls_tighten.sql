-- =============================================================================
-- Tighten outbox INSERT policy to close platform-event spoofing.
--
-- The original 0003 policy allowed any tenant-bound transaction to insert
-- `tenant_id IS NULL` rows. The dispatcher then publishes those rows to
-- the broker as platform-level events, where cross-context subscribers
-- treat them as authoritative. A malicious or buggy tenant context could
-- therefore forge platform events.
--
-- After this migration, NULL-tenant rows are insertable only from system
-- context (`withoutTenant(...)`); tenant-bound transactions must supply
-- their own tenant id.
-- =============================================================================

ALTER POLICY outbox_events_insert_iso ON outbox_events
  WITH CHECK (
    is_system_session()
    OR (tenant_id IS NOT NULL AND tenant_id = current_tenant_id())
  );
