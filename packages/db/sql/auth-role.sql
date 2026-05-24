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

GRANT SELECT, INSERT, UPDATE, DELETE ON
  "user",
  session,
  account,
  verification,
  two_factor,
  member,
  invitation,
  organization_role
TO resto_auth;

-- tenants is BA's "organization" mapping (ADR-0013). SELECT+UPDATE only;
-- INSERT/DELETE stay with the tenancy bounded context.
GRANT SELECT, UPDATE ON tenants TO resto_auth;
