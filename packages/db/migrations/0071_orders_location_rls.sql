-- 0071_orders_location_rls.sql
-- Phase 08.4 Plan 08 (D-03): location-grain RESTRICTIVE RLS on orders,
-- layered on top of the existing orders_brand_iso RESTRICTIVE policy.
-- Reuses current_location_id() from 0065_location_guc.sql -- no new SQL
-- function. Mirrors the brand-grain shape from 0058/0060 and the
-- location-grain shape from 0069_stop_list_location_rls.sql, s/brand/location/.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'orders' AND policyname = 'orders_location_iso'
  ) THEN
    DROP POLICY orders_location_iso ON orders;
  END IF;
END
$$;
--> statement-breakpoint
CREATE POLICY orders_location_iso ON orders
  AS RESTRICTIVE
  USING (is_system_session() OR current_location_id() IS NULL OR location_id = current_location_id())
  WITH CHECK (is_system_session() OR current_location_id() IS NULL OR location_id = current_location_id());
