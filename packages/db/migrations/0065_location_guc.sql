-- 0065_location_guc.sql
-- Phase 08.4 (D-01/D-05): current_location_id() + app_bind_location() —
-- mirror current_brand_id() / app_bind_brand() (post-0061 signature, no
-- p_is_system param; system-session bypass is handled at the tenant-GUC
-- level via is_system_session()).
--
-- No location-grain RLS policy is added here — orders / menu_stop_list /
-- catalog_location_stop_version don't carry location_id yet; their policies
-- land in later plans of this phase.

CREATE OR REPLACE FUNCTION current_location_id() RETURNS uuid
  LANGUAGE sql
  STABLE
  PARALLEL SAFE
AS $$
  SELECT nullif(current_setting('app.current_location', true), '')::uuid;
$$;
--> statement-breakpoint
COMMENT ON FUNCTION current_location_id() IS
  'Returns the location uuid bound to the current transaction by the tenant-aware client, or NULL if none is bound.';
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app_bind_location(p_location TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_current TEXT := current_setting('app.current_location', true);
BEGIN
  IF v_current IS NOT NULL AND v_current <> '' AND v_current <> p_location THEN
    RAISE EXCEPTION
      'app.current_location already bound to % — refusing to rebind to %',
      v_current, p_location
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM set_config('app.current_location', p_location, true);
END
$$;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION app_bind_location(text) FROM PUBLIC;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'resto_app') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION app_bind_location(text) TO resto_app';
  END IF;
END
$$;
