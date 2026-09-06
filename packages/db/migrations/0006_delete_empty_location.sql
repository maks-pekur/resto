-- Deleting a location is the one destructive act an operator may perform on their own data, so
-- it is a function rather than a DELETE grant: the runtime role still cannot delete anything,
-- and the rule "a location that ever took an order is history, not configuration" is enforced
-- here, where no caller can forget it.
CREATE OR REPLACE FUNCTION public.tenancy_delete_location(p_location_id uuid, p_tenant_id uuid)
    RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM locations WHERE id = p_location_id AND tenant_id = p_tenant_id
  ) THEN
    RAISE EXCEPTION 'location_not_found';
  END IF;

  IF EXISTS (SELECT 1 FROM orders WHERE location_id = p_location_id) THEN
    RAISE EXCEPTION 'location_has_orders';
  END IF;

  -- Tables reference zones with ON DELETE RESTRICT, so they go first.
  DELETE FROM restaurant_tables WHERE location_id = p_location_id;
  DELETE FROM table_zones WHERE location_id = p_location_id;
  DELETE FROM member_location_scope WHERE location_id = p_location_id;
  DELETE FROM locations WHERE id = p_location_id AND tenant_id = p_tenant_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.tenancy_delete_location(uuid, uuid) FROM PUBLIC;

-- Guarded so this file stays safe to run before resto_app exists (mirrors
-- roles.sql's own guard shape, 10.6-02 fix — fresh testcontainer bootstrap
-- runs migrate() before provisionAppRole()).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'resto_app') THEN
    GRANT EXECUTE ON FUNCTION public.tenancy_delete_location(uuid, uuid) TO resto_app;
  END IF;
END
$$;
