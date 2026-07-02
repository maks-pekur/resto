-- 0060_brand_rls_restrictive.sql
-- Fix: brand-isolation policies must be RESTRICTIVE so they AND with the
-- existing tenant-level permissive policies rather than OR with them.
--
-- Root cause: 0058 added brand policies as PERMISSIVE (the default). PostgreSQL
-- ORs permissive policies together — when the tenant policy
-- (is_system_session() OR tenant_id = current_tenant_id()) grants access to a
-- row, the brand policy never gets a veto, even when app.current_brand is set.
--
-- Fix: recreate every brand_iso policy AS RESTRICTIVE. A RESTRICTIVE policy
-- ANDs with the combined permissive result. The predicate is unchanged:
--   is_system_session() OR current_brand_id() IS NULL OR brand_id = current_brand_id()
-- which means:
--   - system sessions pass through (withoutTenant)
--   - when no brand GUC is set (tenant-level reads), current_brand_id() IS NULL → pass
--   - when brand GUC is set, only matching-brand rows pass
--
-- Tables: menu_categories, menu_items, menu_item_sizes, menu_modifier_groups,
--         menu_modifier_options, menu_item_modifier_groups, menu_stop_list,
--         catalog_brand_stop_version, orders

-- ---------------------------------------------------------------------------
-- menu_categories
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
  AS RESTRICTIVE
  USING (is_system_session() OR current_brand_id() IS NULL OR brand_id = current_brand_id())
  WITH CHECK (is_system_session() OR current_brand_id() IS NULL OR brand_id = current_brand_id());
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- menu_items
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
  AS RESTRICTIVE
  USING (is_system_session() OR current_brand_id() IS NULL OR brand_id = current_brand_id())
  WITH CHECK (is_system_session() OR current_brand_id() IS NULL OR brand_id = current_brand_id());
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- menu_item_sizes
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
  AS RESTRICTIVE
  USING (is_system_session() OR current_brand_id() IS NULL OR brand_id = current_brand_id())
  WITH CHECK (is_system_session() OR current_brand_id() IS NULL OR brand_id = current_brand_id());
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- menu_modifier_groups
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
  AS RESTRICTIVE
  USING (is_system_session() OR current_brand_id() IS NULL OR brand_id = current_brand_id())
  WITH CHECK (is_system_session() OR current_brand_id() IS NULL OR brand_id = current_brand_id());
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- menu_modifier_options
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
  AS RESTRICTIVE
  USING (is_system_session() OR current_brand_id() IS NULL OR brand_id = current_brand_id())
  WITH CHECK (is_system_session() OR current_brand_id() IS NULL OR brand_id = current_brand_id());
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- menu_item_modifier_groups
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
  AS RESTRICTIVE
  USING (is_system_session() OR current_brand_id() IS NULL OR brand_id = current_brand_id())
  WITH CHECK (is_system_session() OR current_brand_id() IS NULL OR brand_id = current_brand_id());
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- menu_stop_list
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
  AS RESTRICTIVE
  USING (is_system_session() OR current_brand_id() IS NULL OR brand_id = current_brand_id())
  WITH CHECK (is_system_session() OR current_brand_id() IS NULL OR brand_id = current_brand_id());
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- catalog_brand_stop_version
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
  AS RESTRICTIVE
  USING (is_system_session() OR current_brand_id() IS NULL OR brand_id = current_brand_id())
  WITH CHECK (is_system_session() OR current_brand_id() IS NULL OR brand_id = current_brand_id());
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- orders
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
  AS RESTRICTIVE
  USING (is_system_session() OR current_brand_id() IS NULL OR brand_id = current_brand_id())
  WITH CHECK (is_system_session() OR current_brand_id() IS NULL OR brand_id = current_brand_id());
