-- Rollback for 0022_tenant_guc_lock.sql.
-- Drizzle-kit is forward-only; this script is run manually by an operator
-- via `psql -f packages/db/sql/rollback/0022_tenant_guc_lock.down.sql`.

DROP FUNCTION IF EXISTS app_bind_tenant(text, boolean);
