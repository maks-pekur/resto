-- =============================================================================
-- Row-Level Security policies for Resto.
--
-- Tenant isolation contract — read carefully before bypassing.
--
-- 1. Tenant-scoped tables expose rows ONLY when
--      current_setting('app.current_tenant') IS NOT NULL
--      AND it equals the row's tenant_id (cast to uuid).
--    The application layer sets `app.current_tenant` per transaction via
--    the tenant-aware client wrapper (see packages/db/src/client.ts).
--
-- 2. System code (migrations, outbox dispatcher, seed CLI) MUST opt out
--    explicitly via the `withoutTenant(reason, op)` escape hatch, which
--    sets `app.is_system = 'true'` for the duration of a transaction.
--    The `is_system_session()` predicate below recognizes it.
--
-- 3. `FORCE ROW LEVEL SECURITY` ensures these policies apply to the table
--    owner role as well — i.e. you cannot bypass them by being the role
--    that created the table.
-- =============================================================================

CREATE OR REPLACE FUNCTION is_system_session() RETURNS boolean
  LANGUAGE sql
  STABLE
  PARALLEL SAFE
AS $$
  SELECT coalesce(
    nullif(current_setting('app.is_system', true), ''),
    'false'
  )::boolean;
$$;
--> statement-breakpoint
COMMENT ON FUNCTION is_system_session() IS
  'Returns true when the current transaction was opened via withoutTenant() in packages/db.';
--> statement-breakpoint

CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS uuid
  LANGUAGE sql
  STABLE
  PARALLEL SAFE
AS $$
  SELECT nullif(current_setting('app.current_tenant', true), '')::uuid;
$$;
--> statement-breakpoint
COMMENT ON FUNCTION current_tenant_id() IS
  'Returns the tenant uuid bound to the current transaction by the tenant-aware client, or NULL if none is bound.';
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- tenants — a tenant context sees only its own row; system sees all.
-- ---------------------------------------------------------------------------
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenants_self_iso ON tenants
  USING (is_system_session() OR id = current_tenant_id());
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- tenant_domains — visible only to the owning tenant or system.
-- ---------------------------------------------------------------------------
ALTER TABLE tenant_domains ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tenant_domains FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_domains_iso ON tenant_domains
  USING (is_system_session() OR tenant_id = current_tenant_id())
  WITH CHECK (is_system_session() OR tenant_id = current_tenant_id());
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE users FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY users_iso ON users
  USING (is_system_session() OR tenant_id = current_tenant_id())
  WITH CHECK (is_system_session() OR tenant_id = current_tenant_id());
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- menu_categories
-- ---------------------------------------------------------------------------
ALTER TABLE menu_categories ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE menu_categories FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY menu_categories_iso ON menu_categories
  USING (is_system_session() OR tenant_id = current_tenant_id())
  WITH CHECK (is_system_session() OR tenant_id = current_tenant_id());
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- menu_items
-- ---------------------------------------------------------------------------
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE menu_items FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY menu_items_iso ON menu_items
  USING (is_system_session() OR tenant_id = current_tenant_id())
  WITH CHECK (is_system_session() OR tenant_id = current_tenant_id());
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- menu_variants
-- ---------------------------------------------------------------------------
ALTER TABLE menu_variants ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE menu_variants FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY menu_variants_iso ON menu_variants
  USING (is_system_session() OR tenant_id = current_tenant_id())
  WITH CHECK (is_system_session() OR tenant_id = current_tenant_id());
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- menu_modifiers
-- ---------------------------------------------------------------------------
ALTER TABLE menu_modifiers ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE menu_modifiers FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY menu_modifiers_iso ON menu_modifiers
  USING (is_system_session() OR tenant_id = current_tenant_id())
  WITH CHECK (is_system_session() OR tenant_id = current_tenant_id());
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- menu_modifier_options
-- ---------------------------------------------------------------------------
ALTER TABLE menu_modifier_options ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE menu_modifier_options FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY menu_modifier_options_iso ON menu_modifier_options
  USING (is_system_session() OR tenant_id = current_tenant_id())
  WITH CHECK (is_system_session() OR tenant_id = current_tenant_id());
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- menu_item_modifiers (junction)
-- ---------------------------------------------------------------------------
ALTER TABLE menu_item_modifiers ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE menu_item_modifiers FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY menu_item_modifiers_iso ON menu_item_modifiers
  USING (is_system_session() OR tenant_id = current_tenant_id())
  WITH CHECK (is_system_session() OR tenant_id = current_tenant_id());
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- audit_log — tenant rows are tenant-scoped; rows with tenant_id IS NULL
-- are platform events visible only to system context.
-- ---------------------------------------------------------------------------
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY audit_log_read_iso ON audit_log
  FOR SELECT
  USING (
    is_system_session()
    OR (tenant_id IS NOT NULL AND tenant_id = current_tenant_id())
  );
--> statement-breakpoint
CREATE POLICY audit_log_insert_iso ON audit_log
  FOR INSERT
  WITH CHECK (
    is_system_session()
    OR (tenant_id IS NOT NULL AND tenant_id = current_tenant_id())
  );
--> statement-breakpoint
-- audit_log is append-only: no UPDATE / DELETE policy means those
-- operations are denied by default once RLS is enabled.
