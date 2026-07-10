-- 0067_location_tenant_iso.sql
-- Rule 1 fix (found while writing 08.4-01 Task 3 isolation tests): 0063/0064
-- gave `locations` / `member_location_scope` ENABLE + FORCE ROW LEVEL SECURITY
-- but no baseline tenant-grain PERMISSIVE policy. A RESTRICTIVE policy alone
-- (locations_brand_iso) never grants access — Postgres denies ALL rows when
-- a table has RLS forced and zero applicable PERMISSIVE policies, regardless
-- of any RESTRICTIVE policy present. Every other tenant-scoped table gets
-- this baseline policy in its introducing migration (see
-- 0036_catalog_phase4a_new_tables_rls.sql for the established shape) — this
-- migration retrofits it for the two tables introduced in 0063/0064.

CREATE POLICY "locations_iso" ON "locations"
  USING (is_system_session() OR tenant_id = current_tenant_id())
  WITH CHECK (is_system_session() OR tenant_id = current_tenant_id());
--> statement-breakpoint

CREATE POLICY "member_location_scope_iso" ON "member_location_scope"
  USING (is_system_session() OR tenant_id = current_tenant_id())
  WITH CHECK (is_system_session() OR tenant_id = current_tenant_id());
