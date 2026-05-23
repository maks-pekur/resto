-- =============================================================================
-- Resto runtime role provisioning — GRANTS ONLY.
--
-- The `resto_app` role itself is now CREATED/ALTERED by the Node helper
-- in `packages/db/src/roles.ts` via whitelist-validated literal-quote
-- in `client.unsafe()` — Postgres DDL does NOT accept bind parameters
-- for `CREATE/ALTER ROLE PASSWORD`, so safety is provided by strict
-- input validation (no `'`, no `\`, no SQL comment sequences) before
-- the password is wrapped in `'...'`. See RES-245 and
-- `packages/db/src/internal/password.ts` for the security argument.
-- This file is the static-DDL grants block that follows role creation.
--
-- Idempotent. Used by:
--   • test container setup   (packages/db/src/roles.ts)
--   • production runbook     (docs/runbooks/database-roles.md)
-- =============================================================================

GRANT USAGE ON SCHEMA public TO resto_app;

-- DELETE intentionally omitted: domain rules forbid hard deletes (use
-- soft-delete via `archived_at`). Future GC jobs run under their own
-- privileged role rather than reusing the runtime grant.
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO resto_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO resto_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO resto_app;

-- RES-243: resto_app's only path to bind `app.current_tenant` is the
-- SECURITY DEFINER wrapper `app_bind_tenant(text, boolean)`. Migration
-- 0022 revokes the PUBLIC EXECUTE on the wrapper; this restores access
-- for resto_app. The IF EXISTS guard keeps the file safe to run before
-- migration 0022 has applied (no-op in that order).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'app_bind_tenant' AND n.nspname = 'public'
  ) THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION app_bind_tenant(text, boolean) TO resto_app';
  END IF;
END
$$;

-- Future tables / sequences / functions created by the admin role inherit
-- the same grants automatically — operators do not need to remember to
-- re-grant after every migration.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE ON TABLES TO resto_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO resto_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO resto_app;
