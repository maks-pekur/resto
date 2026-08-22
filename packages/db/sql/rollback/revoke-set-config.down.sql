-- Rollback for the set_config revoke (originally migration 0023; squashed into
-- 0000_baseline.sql on 2026-08-23 — the grants it restores still apply).
GRANT EXECUTE ON FUNCTION pg_catalog.set_config(text, text, boolean) TO PUBLIC;
