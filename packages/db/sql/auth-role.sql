-- =============================================================================
-- Resto auth runtime role provisioning.
--
-- `resto_auth` is the role Better Auth's drizzle client connects under.
-- Has BYPASSRLS so BA admin/runtime calls (organization plugin's cross-
-- tenant member/invitation queries, dynamicAccessControl role admin) work
-- against the per-tenant RLS policies introduced in migration 0005.
--
-- The application's regular runtime role (`resto_app`) remains NOBYPASSRLS
-- so business queries are RLS-bound to current_tenant_id().
--
-- Idempotent. Replace `__AUTH_PASSWORD__` before executing — the helper
-- in `packages/db/src/auth-role.ts` does this.
-- =============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'resto_auth') THEN
    ALTER ROLE resto_auth WITH LOGIN NOSUPERUSER BYPASSRLS PASSWORD '__AUTH_PASSWORD__';
  ELSE
    CREATE ROLE resto_auth WITH LOGIN NOSUPERUSER BYPASSRLS PASSWORD '__AUTH_PASSWORD__';
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO resto_auth;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO resto_auth;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO resto_auth;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO resto_auth;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO resto_auth;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO resto_auth;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO resto_auth;
