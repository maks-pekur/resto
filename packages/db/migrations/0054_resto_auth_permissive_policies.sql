-- =============================================================================
-- Option A (D-04): Replace resto_auth BYPASSRLS with explicit permissive RLS
-- policies so the schema provisions on AWS RDS.
--
-- WHY: RDS PostgreSQL's master is `rds_superuser`, NOT a true SUPERUSER.
-- Conferring BYPASSRLS on another role normally requires superuser, so
-- `ALTER ROLE resto_auth WITH BYPASSRLS` HARD-STOPS on RDS. Instead,
-- resto_auth (now NOBYPASSRLS) reaches the four RLS-enabled BA-owned tables
-- it operates on via these explicit permissive policies. Postgres OR-combines
-- permissive policies, so USING(true) evaluates to `true OR <tenant_iso>`
-- = true for resto_auth — equivalent to the old BYPASSRLS effect on exactly
-- this BA surface. The TO-role clause scopes each policy exclusively to
-- resto_auth; resto_app continues to see only its own tenant's rows (the new
-- policies are NOT applicable to resto_app or PUBLIC).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- member — CRUD for Better Auth org-membership management

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'resto_auth')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'member')
     AND NOT EXISTS (
       SELECT 1 FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'member' AND policyname = 'member_resto_auth_full'
     )
  THEN
    EXECUTE 'CREATE POLICY member_resto_auth_full ON member FOR ALL TO resto_auth USING (true) WITH CHECK (true)';
  END IF;
END
$$;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- invitation — CRUD for Better Auth invite lifecycle

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'resto_auth')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'invitation')
     AND NOT EXISTS (
       SELECT 1 FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'invitation' AND policyname = 'invitation_resto_auth_full'
     )
  THEN
    EXECUTE 'CREATE POLICY invitation_resto_auth_full ON invitation FOR ALL TO resto_auth USING (true) WITH CHECK (true)';
  END IF;
END
$$;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- organization_role — CRUD for Better Auth custom role management

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'resto_auth')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'organization_role')
     AND NOT EXISTS (
       SELECT 1 FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'organization_role' AND policyname = 'organization_role_resto_auth_full'
     )
  THEN
    EXECUTE 'CREATE POLICY organization_role_resto_auth_full ON organization_role FOR ALL TO resto_auth USING (true) WITH CHECK (true)';
  END IF;
END
$$;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- tenants — SELECT + UPDATE for Better Auth org-rename hook (ADR-0013).
-- resto_auth holds SELECT + UPDATE on tenants (no INSERT/DELETE); WITH CHECK
-- is required for UPDATE to pass the policy filter on writes.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'resto_auth')
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenants')
     AND NOT EXISTS (
       SELECT 1 FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'tenants' AND policyname = 'tenants_resto_auth_full'
     )
  THEN
    EXECUTE 'CREATE POLICY tenants_resto_auth_full ON tenants FOR ALL TO resto_auth USING (true) WITH CHECK (true)';
  END IF;
END
$$;
