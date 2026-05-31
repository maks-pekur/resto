-- =============================================================================
-- Phase 4a-06 step M: grant DELETE on menu_stop_list to resto_app for the
-- unstop path. The catalog StopListService removes a row when an item is
-- unstopped; without this grant, the operation fails with a permission error
-- on resto_app (NOBYPASSRLS, no DELETE elsewhere except inbox_processed).
-- Stop-list rows are bounded per-item (UNIQUE on (tenant_id, item_id)) so
-- this DELETE is not a soft-delete escape — it is the canonical "unstop"
-- inverse of the INSERT.
--
-- Wrapped in existence checks because in dev/test the role is provisioned
-- AFTER migrations run (see `provisionAppRole`); in prod the runbook order
-- is reversed. Either order must converge to the same end state. Table
-- existence is also guarded because the migration must survive a fresh
-- reset+migrate run (sql/roles.sql also restates the GRANT for that path).
-- =============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'resto_app') THEN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'menu_stop_list') THEN
      EXECUTE 'GRANT DELETE ON menu_stop_list TO resto_app';
    END IF;
  END IF;
END
$$;
