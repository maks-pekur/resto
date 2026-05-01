-- =============================================================================
-- Dev-stack provisioning of the `resto_app` runtime role.
--
-- Mirrors `packages/db/sql/roles.sql` (the canonical source of truth) with
-- the dev password baked in. Runs once when the postgres data volume is
-- first created. To re-apply against an existing volume, either re-run
-- this file via `psql` or recreate with `pnpm dev:reset`.
--
-- Application code at runtime connects with this role; `resto` (the
-- bootstrap user) is the admin and runs migrations only.
-- =============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'resto_app') THEN
    ALTER ROLE resto_app WITH LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD 'resto_app_dev_password';
  ELSE
    CREATE ROLE resto_app WITH LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD 'resto_app_dev_password';
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO resto_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO resto_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO resto_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO resto_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO resto_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO resto_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO resto_app;
