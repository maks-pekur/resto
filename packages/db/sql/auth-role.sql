-- RES-205: resto_auth grants restricted to BA-owned tables only.
-- Script is idempotent and runs on every boot via provisionAuthRole.
-- Leading REVOKE clears any pre-existing broad grants from earlier versions.

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM resto_auth;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM resto_auth;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM resto_auth;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM resto_auth;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM resto_auth;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM resto_auth;

GRANT USAGE ON SCHEMA public TO resto_auth;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['"user"','session','account','verification','two_factor','member','invitation','organization_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = trim('"' FROM t)) THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %s TO resto_auth', t);
    END IF;
  END LOOP;
END
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenants') THEN
    EXECUTE 'GRANT SELECT, UPDATE ON tenants TO resto_auth';
  END IF;
END
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- Permissive RLS policies (Option A, D-04 / RDS).
-- Migration 0054 creates these when the role already exists at migrate-time.
-- These DO blocks re-apply them idempotently here (after the role is guaranteed
-- to exist) so that the order migrate() → provisionAuthRole() also converges.
-- ────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'member')
     AND NOT EXISTS (
       SELECT 1 FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'member' AND policyname = 'member_resto_auth_full'
     )
  THEN
    EXECUTE 'CREATE POLICY member_resto_auth_full ON member FOR ALL TO resto_auth USING (true) WITH CHECK (true)';
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'invitation')
     AND NOT EXISTS (
       SELECT 1 FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'invitation' AND policyname = 'invitation_resto_auth_full'
     )
  THEN
    EXECUTE 'CREATE POLICY invitation_resto_auth_full ON invitation FOR ALL TO resto_auth USING (true) WITH CHECK (true)';
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'organization_role')
     AND NOT EXISTS (
       SELECT 1 FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'organization_role' AND policyname = 'organization_role_resto_auth_full'
     )
  THEN
    EXECUTE 'CREATE POLICY organization_role_resto_auth_full ON organization_role FOR ALL TO resto_auth USING (true) WITH CHECK (true)';
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenants')
     AND NOT EXISTS (
       SELECT 1 FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'tenants' AND policyname = 'tenants_resto_auth_full'
     )
  THEN
    EXECUTE 'CREATE POLICY tenants_resto_auth_full ON tenants FOR ALL TO resto_auth USING (true) WITH CHECK (true)';
  END IF;
END
$$;
