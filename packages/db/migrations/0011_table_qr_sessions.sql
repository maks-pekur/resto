-- A QR code stops carrying the table's own id. It carries a secret that is exchanged, once, for a
-- session; the menu URL after that holds nothing worth copying, and the server — not the browser —
-- decides which table an order belongs to.
ALTER TABLE public.restaurant_tables ADD COLUMN qr_token text;

UPDATE public.restaurant_tables
   SET qr_token = encode(gen_random_bytes(16), 'hex')
 WHERE qr_token IS NULL;

ALTER TABLE public.restaurant_tables ALTER COLUMN qr_token SET NOT NULL;
CREATE UNIQUE INDEX restaurant_tables_qr_token_uq ON public.restaurant_tables (qr_token);

CREATE TABLE public.table_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  table_id uuid NOT NULL,
  location_id uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT table_sessions_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES public.tenants (id) ON DELETE CASCADE,
  CONSTRAINT table_sessions_table_fk FOREIGN KEY (table_id, tenant_id)
    REFERENCES public.restaurant_tables (id, tenant_id) ON DELETE CASCADE
);

CREATE INDEX table_sessions_tenant_table_idx
  ON public.table_sessions (tenant_id, table_id, expires_at);

ALTER TABLE public.table_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.table_sessions FORCE ROW LEVEL SECURITY;

CREATE POLICY table_sessions_iso ON public.table_sessions
  USING ((public.is_system_session() OR (tenant_id = public.current_tenant_id())))
  WITH CHECK ((public.is_system_session() OR (tenant_id = public.current_tenant_id())));

CREATE POLICY table_sessions_location_iso ON public.table_sessions AS RESTRICTIVE
  USING ((public.is_system_session() OR (public.current_location_id() IS NULL) OR (location_id = public.current_location_id())))
  WITH CHECK ((public.is_system_session() OR (public.current_location_id() IS NULL) OR (location_id = public.current_location_id())));

GRANT SELECT, INSERT ON public.table_sessions TO resto_app;
