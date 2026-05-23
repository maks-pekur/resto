-- =============================================================================
-- Resto auth runtime role provisioning — GRANTS ONLY.
--
-- The `resto_auth` role itself is now CREATED/ALTERED by the Node helper
-- in `packages/db/src/auth-role.ts` via whitelist-validated literal-quote
-- in `client.unsafe()` — Postgres DDL does NOT accept bind parameters
-- for `CREATE/ALTER ROLE PASSWORD`, so safety is provided by strict
-- input validation. See RES-245 and `packages/db/src/internal/password.ts`.
-- This file is the static-DDL grants block that follows role creation.
--
-- `resto_auth` has BYPASSRLS so BA admin/runtime calls (organization
-- plugin's cross-tenant member/invitation queries, dynamicAccessControl
-- role admin) work against the per-tenant RLS policies in migration 0005.
--
-- The application's regular runtime role (`resto_app`) remains
-- NOBYPASSRLS so business queries are RLS-bound to current_tenant_id().
-- =============================================================================

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
