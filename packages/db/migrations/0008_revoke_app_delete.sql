-- =============================================================================
-- Revoke DELETE from the runtime `resto_app` role.
--
-- Domain rules forbid hard deletes (soft-delete via `archived_at` everywhere).
-- The original grant in `sql/roles.sql` included DELETE on ALL TABLES, which
-- left a SQL-injection or app-bug shaped hole large enough to drive a truck
-- through. This migration aligns the live cluster with the new role script.
--
-- `withoutTenant(...)` is a GUC bypass, NOT a role switch — `resto_app`
-- still runs every transaction, just with `app.is_system = true`. Therefore
-- removing DELETE from `resto_app` blocks even the dispatcher from issuing
-- deletes (it doesn't today; future GC will use its own role).
--
-- The REVOKE is wrapped in an existence check because in test/dev the role
-- is provisioned AFTER migrations run (see `provisionAppRole`); in prod the
-- runbook order is reversed (provision first, then migrate). Either order
-- must converge to the same end state.
-- =============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'resto_app') THEN
    EXECUTE 'REVOKE DELETE ON ALL TABLES IN SCHEMA public FROM resto_app';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE DELETE ON TABLES FROM resto_app';
  END IF;
END
$$;
