-- Raising a hand, in software: the guest asks, the floor sees it, someone closes it.
CREATE TABLE IF NOT EXISTS public.service_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  location_id uuid NOT NULL,
  table_id uuid NOT NULL,
  kind text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  CONSTRAINT service_requests_kind_chk CHECK (kind IN ('waiter', 'bill')),
  CONSTRAINT service_requests_status_chk CHECK (status IN ('open', 'resolved')),
  CONSTRAINT service_requests_resolved_chk CHECK ((status = 'resolved') = (resolved_at IS NOT NULL)),
  CONSTRAINT service_requests_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES public.tenants (id) ON DELETE CASCADE,
  CONSTRAINT service_requests_table_fk FOREIGN KEY (table_id, tenant_id)
    REFERENCES public.restaurant_tables (id, tenant_id) ON DELETE CASCADE,
  CONSTRAINT service_requests_location_fk FOREIGN KEY (location_id, tenant_id)
    REFERENCES public.locations (id, tenant_id) ON DELETE RESTRICT
);

-- One open call of a kind per table: tapping twice must not fill the floor's screen.
CREATE UNIQUE INDEX IF NOT EXISTS service_requests_open_uq
  ON public.service_requests (tenant_id, table_id, kind)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS service_requests_open_idx
  ON public.service_requests (tenant_id, location_id, status, created_at);

ALTER TABLE public.service_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.service_requests FORCE ROW LEVEL SECURITY;

CREATE POLICY service_requests_iso ON public.service_requests
  USING ((public.is_system_session() OR (tenant_id = public.current_tenant_id())))
  WITH CHECK ((public.is_system_session() OR (tenant_id = public.current_tenant_id())));

CREATE POLICY service_requests_location_iso ON public.service_requests AS RESTRICTIVE
  USING ((public.is_system_session() OR (public.current_location_id() IS NULL) OR (location_id = public.current_location_id())))
  WITH CHECK ((public.is_system_session() OR (public.current_location_id() IS NULL) OR (location_id = public.current_location_id())));

-- Guarded so this file stays safe to run before resto_app exists (mirrors
-- roles.sql's own guard shape, 10.6-02 fix — fresh testcontainer bootstrap
-- runs migrate() before provisionAppRole()).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'resto_app') THEN
    GRANT SELECT, INSERT, UPDATE ON public.service_requests TO resto_app;
  END IF;
END
$$;
