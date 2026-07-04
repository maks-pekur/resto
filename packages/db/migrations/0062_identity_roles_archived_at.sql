-- 0062_identity_roles_archived_at.sql
-- D-12 (08.3): soft-delete gate for custom roles.
-- archive-role.service.ts sets this instead of calling BA's hard-delete endpoint.
ALTER TABLE "organization_role" ADD COLUMN IF NOT EXISTS "archived_at" timestamp with time zone;
