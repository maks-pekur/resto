-- 0022_tenant_guc_lock.sql
-- RES-243 (ADR-0020 I-1, ADR-0021 Tier 1):
-- Introduce `app_bind_tenant(text, boolean)` as the SECURITY DEFINER
-- wrapper that becomes the only sanctioned way to bind `app.current_tenant`.
-- The wrapper raises on rebind to a different tenant; same-tenant rebind
-- is idempotent.
--
-- This migration adds the wrapper only. The companion REVOKE of
-- `pg_catalog.set_config(text,text,boolean)` lands in migration
-- 0023_revoke_set_config.sql once `client.ts` is fully migrated to call
-- the wrapper.

CREATE OR REPLACE FUNCTION app_bind_tenant(p_tenant TEXT, p_is_system BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_current TEXT := current_setting('app.current_tenant', true);
BEGIN
  IF v_current IS NOT NULL AND v_current <> '' AND v_current <> p_tenant THEN
    RAISE EXCEPTION
      'app.current_tenant already bound to % — refusing to rebind to %',
      v_current, p_tenant
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM set_config('app.current_tenant', p_tenant, true);
  PERFORM set_config(
    'app.is_system',
    CASE WHEN p_is_system THEN 'true' ELSE 'false' END,
    true
  );
END
$$;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION app_bind_tenant(TEXT, BOOLEAN) FROM PUBLIC;
--> statement-breakpoint
-- Conditional grant: in a fresh test container `resto_app` is provisioned
-- after migrations run, so this DO block is a no-op there; `roles.sql`
-- repeats the GRANT for that path.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'resto_app') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION app_bind_tenant(TEXT, BOOLEAN) TO resto_app';
  END IF;
END
$$;
