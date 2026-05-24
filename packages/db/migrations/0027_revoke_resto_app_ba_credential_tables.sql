-- =============================================================================
-- Revoke SELECT/INSERT/UPDATE/DELETE on BA credential tables from resto_app.
--
-- BA credential tables (account, two_factor, verification, session) hold
-- password hashes, OAuth tokens, 2FA secrets, and session bearer tokens.
-- These must only be accessible to resto_auth (BYPASSRLS) per ADR-0013.
--
-- The REVOKE is wrapped in existence checks because in dev/test the role is
-- provisioned AFTER migrations run (see `provisionAppRole`); in prod the
-- runbook order is reversed. Either order must converge to the same end state.
-- Table existence is also guarded because this migration must survive a
-- fresh reset+migrate run.
-- =============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'resto_app') THEN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'account') THEN
      EXECUTE 'REVOKE SELECT, INSERT, UPDATE, DELETE ON account FROM resto_app';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'two_factor') THEN
      EXECUTE 'REVOKE SELECT, INSERT, UPDATE, DELETE ON two_factor FROM resto_app';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'verification') THEN
      EXECUTE 'REVOKE SELECT, INSERT, UPDATE, DELETE ON verification FROM resto_app';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'session') THEN
      EXECUTE 'REVOKE SELECT, INSERT, UPDATE, DELETE ON session FROM resto_app';
    END IF;
  END IF;
END
$$;
