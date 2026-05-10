-- 0017_member_brand_scope_rls.sql
-- RES-149: Tenant-self-iso RLS for member_brand_scope (denormalized
-- tenant_id keeps the policy free of joins).

ALTER TABLE member_brand_scope ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE member_brand_scope FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY member_brand_scope_iso ON member_brand_scope
  USING (is_system_session() OR tenant_id = current_tenant_id())
  WITH CHECK (is_system_session() OR tenant_id = current_tenant_id());
--> statement-breakpoint
