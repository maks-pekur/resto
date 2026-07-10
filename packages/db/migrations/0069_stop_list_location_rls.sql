-- 0069_stop_list_location_rls.sql
-- Phase 08.4 Plan 06 (D-02, T-084-17): location-grain RESTRICTIVE RLS on
-- menu_stop_list + catalog_location_stop_version. Reuses current_location_id()
-- / app_bind_location() from 0065_location_guc.sql -- no new SQL function.
-- Mirrors the brand-grain shape from 0058/0060, s/brand/location/.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'menu_stop_list' AND policyname = 'menu_stop_list_location_iso'
  ) THEN
    DROP POLICY menu_stop_list_location_iso ON menu_stop_list;
  END IF;
END
$$;
--> statement-breakpoint
CREATE POLICY menu_stop_list_location_iso ON menu_stop_list
  AS RESTRICTIVE
  USING (is_system_session() OR current_location_id() IS NULL OR location_id = current_location_id())
  WITH CHECK (is_system_session() OR current_location_id() IS NULL OR location_id = current_location_id());
--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'catalog_location_stop_version' AND policyname = 'catalog_location_stop_version_location_iso'
  ) THEN
    DROP POLICY catalog_location_stop_version_location_iso ON catalog_location_stop_version;
  END IF;
END
$$;
--> statement-breakpoint
CREATE POLICY catalog_location_stop_version_location_iso ON catalog_location_stop_version
  AS RESTRICTIVE
  USING (is_system_session() OR current_location_id() IS NULL OR location_id = current_location_id())
  WITH CHECK (is_system_session() OR current_location_id() IS NULL OR location_id = current_location_id());
