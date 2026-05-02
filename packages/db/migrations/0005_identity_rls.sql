-- =============================================================================
-- Hybrid RLS for identity-related tables introduced in 0004.
-- Spec §3.9 and ADR-0013 detail the rationale.
-- Reuses is_system_session() and current_tenant_id() from migration 0001.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- member — operator-tenant binding (per-tenant)

ALTER TABLE "member" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "member" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY member_tenant_isolation ON "member"
  USING (is_system_session() OR organization_id = current_tenant_id())
  WITH CHECK (is_system_session() OR organization_id = current_tenant_id());
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- invitation — pending operator invites (per-tenant)

ALTER TABLE "invitation" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "invitation" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY invitation_tenant_isolation ON "invitation"
  USING (is_system_session() OR organization_id = current_tenant_id())
  WITH CHECK (is_system_session() OR organization_id = current_tenant_id());
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- organization_role — tenant-defined custom roles (per-tenant)

ALTER TABLE organization_role ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE organization_role FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY organization_role_tenant_isolation ON organization_role
  USING (is_system_session() OR organization_id = current_tenant_id())
  WITH CHECK (is_system_session() OR organization_id = current_tenant_id());
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- customer_profiles — per-tenant customer state

ALTER TABLE customer_profiles ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE customer_profiles FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY customer_profiles_tenant_isolation ON customer_profiles
  USING (is_system_session() OR tenant_id = current_tenant_id())
  WITH CHECK (is_system_session() OR tenant_id = current_tenant_id());
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- BA's drizzle client connects under `resto_auth` (BYPASSRLS) per ADR-0013.
-- That role bypasses these policies cleanly.
-- The runtime app role `resto_app` (NOBYPASSRLS) IS bound by these policies
-- and must run inside a tenant-bound transaction (TenantAwareDb.withTenant).
-- ---------------------------------------------------------------------------

-- Global BA tables (user, session, account, verification, two_factor) are
-- intentionally NOT given RLS. Application-layer protection: BA's
-- organization plugin scopes member queries by organization; AuthGuard
-- (Phase B) cross-checks principal.tenantId against ALS-resolved tenant
-- from TenantContextMiddleware. ADR-0013 documents this exception.
