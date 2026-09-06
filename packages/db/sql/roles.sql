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

-- TEN-13 / OQ-2 Option B: the daily inbox-retention sweep is the one place
-- resto_app needs DELETE. Migration 0028 also issues this GRANT but its
-- table-existence guard fails when migrate runs before this role is
-- provisioned (test container order). Restating the GRANT here keeps the
-- end state convergent regardless of which step runs first.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'inbox_processed') THEN
    EXECUTE 'GRANT DELETE ON inbox_processed TO resto_app';
  END IF;
END
$$;

-- Phase 4a-06: stop-list unstop is the inverse of the stop INSERT — rows are
-- bounded per-item (UNIQUE on (tenant_id, item_id)). Migration 0040 issues the
-- same GRANT; restating it here keeps the end state convergent on fresh setups.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'menu_stop_list') THEN
    EXECUTE 'GRANT DELETE ON menu_stop_list TO resto_app';
  END IF;
END
$$;

-- Migration 0053 grants DELETE on the link table so replaceItemModifierGroups can delete+reinsert
-- links. Restating it here keeps the end state convergent on fresh setups regardless of order.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'menu_item_modifier_groups') THEN
    EXECUTE 'GRANT DELETE ON menu_item_modifier_groups TO resto_app';
  END IF;
END
$$;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['account','two_factor','verification','session'] LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = t) THEN
      EXECUTE format('REVOKE SELECT, INSERT, UPDATE, DELETE ON %I FROM resto_app', t);
    END IF;
  END LOOP;
END
$$;

-- Phase 10.3: table_zones / restaurant_tables. Migration 0003 issues the same
-- GRANT; restating it here keeps the end state convergent regardless of whether
-- roles.sql or the migration runs first (mirrors the menu_stop_list guard above).
-- DELETE intentionally omitted — hard deletes are forbidden, lifecycle is
-- status = 'archived'.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'table_zones') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON table_zones TO resto_app';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'restaurant_tables') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON restaurant_tables TO resto_app';
  END IF;
END
$$;

-- Migration 0019 grants DELETE on the ingredient-library link tables so
-- membership can be written delete-then-reinsert. Restating it here keeps
-- the end state convergent on fresh setups regardless of order.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'menu_modifier_group_options') THEN
    EXECUTE 'GRANT DELETE ON menu_modifier_group_options TO resto_app';
  END IF;
END
$$;

-- Migration 0019 grants DELETE on the ingredient-library link tables so
-- membership can be written delete-then-reinsert. Restating it here keeps
-- the end state convergent on fresh setups regardless of order.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'menu_item_modifier_options') THEN
    EXECUTE 'GRANT DELETE ON menu_item_modifier_options TO resto_app';
  END IF;
END
$$;

-- Migration 0019 grants DELETE on menu_option_stop_list so unstop can delete
-- the stop row (the menu_stop_list precedent). Restating it here keeps the
-- end state convergent on fresh setups regardless of order.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'menu_option_stop_list') THEN
    EXECUTE 'GRANT DELETE ON menu_option_stop_list TO resto_app';
  END IF;
END
$$;
