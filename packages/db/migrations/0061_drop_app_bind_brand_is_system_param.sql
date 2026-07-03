-- 0061_drop_app_bind_brand_is_system_param.sql
-- CR-04 (08.2-gap): app_bind_brand(p_brand TEXT, p_is_system BOOLEAN) silently
-- ignores p_is_system. The brand-level system-session bypass is correctly handled
-- by the tenant-level app.is_system GUC set by app_bind_tenant('', true).
-- Drop the misleading dead parameter; update REVOKE/GRANT to match new signature.

CREATE OR REPLACE FUNCTION app_bind_brand(p_brand TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_current TEXT := current_setting('app.current_brand', true);
BEGIN
  IF v_current IS NOT NULL AND v_current <> '' AND v_current <> p_brand THEN
    RAISE EXCEPTION
      'app.current_brand already bound to % — refusing to rebind to %',
      v_current, p_brand
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM set_config('app.current_brand', p_brand, true);
END
$$;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION app_bind_brand(text, boolean) FROM PUBLIC;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION app_bind_brand(text) FROM PUBLIC;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'resto_app') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION app_bind_brand(text) TO resto_app';
  END IF;
END
$$;
