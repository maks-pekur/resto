-- =============================================================================
-- Resto runtime role provisioning.
--
-- Two roles per Resto database:
--
--   resto_admin  — owns the schema, runs migrations. Effectively superuser
--                  within its database. Used by `db:migrate` only.
--   resto_app    — runtime role used by `apps/api` and any other long-lived
--                  service. LOGIN, NOSUPERUSER, NOBYPASSRLS. Granted just
--                  the privileges runtime needs.
--
-- This script provisions only `resto_app`. The admin role is whatever role
-- runs *this* script: in dev that is the docker-entrypoint bootstrap user
-- (`POSTGRES_USER=resto`); in production it is whichever superuser the
-- managed-Postgres provider hands you at provisioning time.
--
-- The script is idempotent — safe to re-run, and used by:
--   • dev docker init        (infra/docker/postgres/init/02-app-role.sql)
--   • test container setup   (packages/db/src/roles.ts)
--   • production runbook     (docs/runbooks/database-roles.md)
--
-- The literal `__APP_PASSWORD__` is a placeholder the caller must replace
-- with the desired runtime password before executing. The Node helper in
-- `packages/db/src/roles.ts` does this substitution for you.
-- =============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'resto_app') THEN
    ALTER ROLE resto_app WITH LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD '__APP_PASSWORD__';
  ELSE
    CREATE ROLE resto_app WITH LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD '__APP_PASSWORD__';
  END IF;
END
$$;

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
