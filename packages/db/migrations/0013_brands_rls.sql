-- 0013_brands_rls.sql
-- RES-149: Tenant-self-isolation RLS for the new `brands` table.
--
-- Brand-scope isolation inside a tenant is enforced at the application
-- layer per ADR-0019 §5.1 — RLS continues to filter by tenant_id only.
-- This file mirrors the policy shape used for tenant_domains in
-- 0001_rls_policies.sql.

ALTER TABLE brands ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE brands FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY brands_iso ON brands
  USING (is_system_session() OR tenant_id = current_tenant_id())
  WITH CHECK (is_system_session() OR tenant_id = current_tenant_id());
--> statement-breakpoint
