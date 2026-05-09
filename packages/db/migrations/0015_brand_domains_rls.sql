-- 0015_brand_domains_rls.sql
-- RES-149: Tenant-self-iso RLS for brand_domains. Mirrors tenant_domains.

ALTER TABLE brand_domains ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE brand_domains FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY brand_domains_iso ON brand_domains
  USING (is_system_session() OR tenant_id = current_tenant_id())
  WITH CHECK (is_system_session() OR tenant_id = current_tenant_id());
--> statement-breakpoint
