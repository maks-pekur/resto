-- Rollback for the tenant GUC lock (originally migration 0022; squashed into
-- 0000_baseline.sql on 2026-08-23 — the objects it drops still exist).
-- Drizzle-kit is forward-only; this script is run manually by an operator
-- via `psql -f packages/db/sql/rollback/tenant-guc-lock.down.sql`.

DROP FUNCTION IF EXISTS app_bind_tenant(text, boolean);
