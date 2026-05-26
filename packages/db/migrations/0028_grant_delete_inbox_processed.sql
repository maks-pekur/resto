-- =============================================================================
-- TEN-13 / OQ-2 Option B: narrow GRANT DELETE on inbox_processed to resto_app
-- for the daily retention sweep. NO other DELETE grants permitted;
-- assertNoRlsBypass (existing) and assertNoBaCredentialAccess (PR 4) continue
-- to enforce that resto_app holds DELETE on this single table only.
--
-- The GRANT is wrapped in existence checks because in dev/test the role is
-- provisioned AFTER migrations run (see `provisionAppRole`); in prod the
-- runbook order is reversed. Either order must converge to the same end state.
-- Table existence is also guarded because this migration must survive a
-- fresh reset+migrate run.
-- =============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'resto_app') THEN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'inbox_processed') THEN
      EXECUTE 'GRANT DELETE ON inbox_processed TO resto_app';
    END IF;
  END IF;
END
$$;
