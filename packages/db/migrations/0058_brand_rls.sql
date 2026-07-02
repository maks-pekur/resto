-- 0058_brand_rls.sql
-- D-14 SCOPE NOTE
-- -----------------------------------------------------------------------
-- This migration implements brand-level RLS for the directly-addressable
-- brand_id NOT NULL tables: 9 menu_* tables + orders.
--
-- EXCLUDED (accepted debt, SC-6 escape hatch):
--   payments / payment_refunds — these tables have NO brand_id column;
--   they reach a brand only via orders.brand_id. Adding brand RLS would
--   require a new brand_id column + backfill, which is out of scope for
--   this phase (D-02 "no schema bloat beyond what's needed").
--   Isolation for payments/payment_refunds is app-layer-only:
--     - BrandScopeGuard on the payouts controller
--     - Tenant-level RLS (already in place)
--   This is documented as accepted debt in 08.2-02-SUMMARY.md.
--
-- Tables receiving brand policies in this migration:
--   menu_categories, menu_items, menu_item_sizes, menu_modifier_groups,
--   menu_modifier_options, menu_item_modifier_groups, menu_stop_list,
--   catalog_brand_stop_version, orders
--
-- Policy expression: is_system_session()
--                    OR current_brand_id() IS NULL   -- tenant-level reads pass through
--                    OR brand_id = current_brand_id() -- brand-bound reads are filtered
-- -----------------------------------------------------------------------

-- current_brand_id(): read the app.current_brand GUC, return NULL if not set.
CREATE OR REPLACE FUNCTION current_brand_id() RETURNS uuid
  LANGUAGE sql
  STABLE
  PARALLEL SAFE
AS $$
  SELECT nullif(current_setting('app.current_brand', true), '')::uuid;
$$;
--> statement-breakpoint
COMMENT ON FUNCTION current_brand_id() IS
  'Returns the brand uuid bound to the current transaction by the tenant-aware client, or NULL if none is bound.';
--> statement-breakpoint

-- app_bind_brand(p_brand TEXT, p_is_system BOOLEAN): SECURITY DEFINER wrapper.
-- Mirrors app_bind_tenant: raises on rebind to a different brand; same-brand rebind
-- is idempotent. REVOKE from PUBLIC; GRANT to resto_app only.
CREATE OR REPLACE FUNCTION app_bind_brand(p_brand TEXT, p_is_system BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_current TEXT := current_setting('app.current_brand', true);
BEGIN
  IF v_current IS NOT NULL AND v_current <> '' AND v_current <> p_brand THEN
    RAISE EXCEPTION
      'app.current_brand already bound to % — refusing to rebind to %',
      v_current, p_brand
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM set_config('app.current_brand', p_brand, true);
END
$$;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION app_bind_brand(text, boolean) FROM PUBLIC;
--> statement-breakpoint
-- Conditional grant: in a fresh test container `resto_app` is provisioned
-- after migrations run, so this DO block is a no-op there; `roles.sql`
-- repeats the GRANT for that path.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'resto_app') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION app_bind_brand(text, boolean) TO resto_app';
  END IF;
END
$$;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- menu_categories — brand isolation policy
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'menu_categories' AND policyname = 'menu_categories_brand_iso'
  ) THEN
    DROP POLICY menu_categories_brand_iso ON menu_categories;
  END IF;
END
$$;
--> statement-breakpoint
CREATE POLICY menu_categories_brand_iso ON menu_categories
  USING (is_system_session() OR current_brand_id() IS NULL OR brand_id = current_brand_id())
  WITH CHECK (is_system_session() OR current_brand_id() IS NULL OR brand_id = current_brand_id());
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- menu_items — brand isolation policy
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'menu_items' AND policyname = 'menu_items_brand_iso'
  ) THEN
    DROP POLICY menu_items_brand_iso ON menu_items;
  END IF;
END
$$;
--> statement-breakpoint
CREATE POLICY menu_items_brand_iso ON menu_items
  USING (is_system_session() OR current_brand_id() IS NULL OR brand_id = current_brand_id())
  WITH CHECK (is_system_session() OR current_brand_id() IS NULL OR brand_id = current_brand_id());
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- menu_item_sizes — brand isolation policy
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'menu_item_sizes' AND policyname = 'menu_item_sizes_brand_iso'
  ) THEN
    DROP POLICY menu_item_sizes_brand_iso ON menu_item_sizes;
  END IF;
END
$$;
--> statement-breakpoint
CREATE POLICY menu_item_sizes_brand_iso ON menu_item_sizes
  USING (is_system_session() OR current_brand_id() IS NULL OR brand_id = current_brand_id())
  WITH CHECK (is_system_session() OR current_brand_id() IS NULL OR brand_id = current_brand_id());
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- menu_modifier_groups — brand isolation policy
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'menu_modifier_groups' AND policyname = 'menu_modifier_groups_brand_iso'
  ) THEN
    DROP POLICY menu_modifier_groups_brand_iso ON menu_modifier_groups;
  END IF;
END
$$;
--> statement-breakpoint
CREATE POLICY menu_modifier_groups_brand_iso ON menu_modifier_groups
  USING (is_system_session() OR current_brand_id() IS NULL OR brand_id = current_brand_id())
  WITH CHECK (is_system_session() OR current_brand_id() IS NULL OR brand_id = current_brand_id());
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- menu_modifier_options — brand isolation policy
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'menu_modifier_options' AND policyname = 'menu_modifier_options_brand_iso'
  ) THEN
    DROP POLICY menu_modifier_options_brand_iso ON menu_modifier_options;
  END IF;
END
$$;
--> statement-breakpoint
CREATE POLICY menu_modifier_options_brand_iso ON menu_modifier_options
  USING (is_system_session() OR current_brand_id() IS NULL OR brand_id = current_brand_id())
  WITH CHECK (is_system_session() OR current_brand_id() IS NULL OR brand_id = current_brand_id());
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- menu_item_modifier_groups (junction) — brand isolation policy
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'menu_item_modifier_groups' AND policyname = 'menu_item_modifier_groups_brand_iso'
  ) THEN
    DROP POLICY menu_item_modifier_groups_brand_iso ON menu_item_modifier_groups;
  END IF;
END
$$;
--> statement-breakpoint
CREATE POLICY menu_item_modifier_groups_brand_iso ON menu_item_modifier_groups
  USING (is_system_session() OR current_brand_id() IS NULL OR brand_id = current_brand_id())
  WITH CHECK (is_system_session() OR current_brand_id() IS NULL OR brand_id = current_brand_id());
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- menu_stop_list — brand isolation policy
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'menu_stop_list' AND policyname = 'menu_stop_list_brand_iso'
  ) THEN
    DROP POLICY menu_stop_list_brand_iso ON menu_stop_list;
  END IF;
END
$$;
--> statement-breakpoint
CREATE POLICY menu_stop_list_brand_iso ON menu_stop_list
  USING (is_system_session() OR current_brand_id() IS NULL OR brand_id = current_brand_id())
  WITH CHECK (is_system_session() OR current_brand_id() IS NULL OR brand_id = current_brand_id());
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- catalog_brand_stop_version — brand isolation policy
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'catalog_brand_stop_version' AND policyname = 'catalog_brand_stop_version_brand_iso'
  ) THEN
    DROP POLICY catalog_brand_stop_version_brand_iso ON catalog_brand_stop_version;
  END IF;
END
$$;
--> statement-breakpoint
CREATE POLICY catalog_brand_stop_version_brand_iso ON catalog_brand_stop_version
  USING (is_system_session() OR current_brand_id() IS NULL OR brand_id = current_brand_id())
  WITH CHECK (is_system_session() OR current_brand_id() IS NULL OR brand_id = current_brand_id());
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- orders — brand isolation policy
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'orders' AND policyname = 'orders_brand_iso'
  ) THEN
    DROP POLICY orders_brand_iso ON orders;
  END IF;
END
$$;
--> statement-breakpoint
CREATE POLICY orders_brand_iso ON orders
  USING (is_system_session() OR current_brand_id() IS NULL OR brand_id = current_brand_id())
  WITH CHECK (is_system_session() OR current_brand_id() IS NULL OR brand_id = current_brand_id());
