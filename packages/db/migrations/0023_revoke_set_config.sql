-- 0023_revoke_set_config.sql
-- RES-243: revoke EXECUTE on the function form of `set_config` so that
-- `resto_app` cannot bind GUCs directly. The SECURITY DEFINER wrapper
-- `app_bind_tenant` (introduced in migration 0022) is now the only path
-- and it raises on rebind to a different tenant.
--
-- `resto_auth` (BYPASSRLS Better Auth role per ADR-0013) does not call
-- set_config; it needs no replacement grant.

REVOKE EXECUTE ON FUNCTION pg_catalog.set_config(text, text, boolean) FROM PUBLIC;
