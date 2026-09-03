-- A review belongs to an order, not to an account: the order is the proof that the guest was here.
CREATE TABLE IF NOT EXISTS public.order_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  order_id uuid NOT NULL,
  location_id uuid NOT NULL,
  rating smallint NOT NULL,
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_feedback_rating_chk CHECK (rating BETWEEN 1 AND 5),
  CONSTRAINT order_feedback_comment_len_chk CHECK (comment IS NULL OR length(comment) <= 2000),
  CONSTRAINT order_feedback_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES public.tenants (id) ON DELETE CASCADE,
  CONSTRAINT order_feedback_order_fk FOREIGN KEY (order_id, tenant_id)
    REFERENCES public.orders (id, tenant_id) ON DELETE CASCADE
);

-- One review per order: a second submission updates nothing and is refused upstream.
CREATE UNIQUE INDEX IF NOT EXISTS order_feedback_order_uq
  ON public.order_feedback (tenant_id, order_id);

CREATE INDEX IF NOT EXISTS order_feedback_recent_idx
  ON public.order_feedback (tenant_id, location_id, created_at DESC);

ALTER TABLE public.order_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.order_feedback FORCE ROW LEVEL SECURITY;

CREATE POLICY order_feedback_iso ON public.order_feedback
  USING ((public.is_system_session() OR (tenant_id = public.current_tenant_id())))
  WITH CHECK ((public.is_system_session() OR (tenant_id = public.current_tenant_id())));

CREATE POLICY order_feedback_location_iso ON public.order_feedback AS RESTRICTIVE
  USING ((public.is_system_session() OR (public.current_location_id() IS NULL) OR (location_id = public.current_location_id())))
  WITH CHECK ((public.is_system_session() OR (public.current_location_id() IS NULL) OR (location_id = public.current_location_id())));

-- Guarded so this file stays safe to run before resto_app exists (mirrors
-- roles.sql's own guard shape, 10.6-02 fix — fresh testcontainer bootstrap
-- runs migrate() before provisionAppRole()).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'resto_app') THEN
    GRANT SELECT, INSERT ON public.order_feedback TO resto_app;
  END IF;
END
$$;
