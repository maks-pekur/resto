-- menu_item_modifier_groups is a pure link table; PK (menu_item_id, modifier_group_id) bounds
-- rows per item, so DELETE is the canonical inverse of the link INSERT — same justification
-- migration 0040 documents for the stop-list. Wrapped in existence checks so this migration
-- converges in any provisioning order (role before table, table before role, or both together).

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'resto_app') THEN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'menu_item_modifier_groups') THEN
      EXECUTE 'GRANT DELETE ON menu_item_modifier_groups TO resto_app';
    END IF;
  END IF;
END
$$;
