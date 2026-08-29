-- Table zones and tables: two new location children, plus the erasure-function
-- and orders-snapshot fallout (phase 10.3, TBL-01/02/08).
--
-- Written by hand rather than generated: the 0000 baseline came from pg_dump, so
-- drizzle has no snapshot to diff against and `db:generate` emits the whole schema
-- instead of the delta (.planning/todos/drizzle-generate-is-broken.md).

CREATE TABLE public.table_zones (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    location_id uuid NOT NULL,
    name text NOT NULL,
    status text DEFAULT 'active' NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    archived_at timestamp with time zone,
    CONSTRAINT table_zones_pkey PRIMARY KEY (id),
    CONSTRAINT table_zones_status_chk CHECK (status IN ('active','archived'))
);
--> statement-breakpoint
ALTER TABLE ONLY public.table_zones FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE TABLE public.restaurant_tables (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    zone_id uuid NOT NULL,
    -- Denormalised onto this child (not just derivable through zone_id) — it is
    -- what makes the RESTRICTIVE location-isolation RLS policy below possible
    -- (CONTEXT D-20 / CTO BLOCK-2), mirroring menu_stop_list.location_id.
    location_id uuid NOT NULL,
    -- Free display text — an operator may type "A1" or "терраса-3" (CONTEXT D-23).
    number text NOT NULL,
    -- Integer sort key TBL-10's unlabelled sheet depends on; free-text `number`
    -- alone sorts lexicographically (1, 10, 11, 2, 20) (CONTEXT D-23).
    ordinal integer NOT NULL,
    status text DEFAULT 'active' NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    archived_at timestamp with time zone,
    CONSTRAINT restaurant_tables_pkey PRIMARY KEY (id),
    CONSTRAINT restaurant_tables_status_chk CHECK (status IN ('active','archived'))
);
--> statement-breakpoint
ALTER TABLE ONLY public.restaurant_tables FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

-- Indexes. `_id_tenant_uq` exposes UNIQUE (id, tenant_id) so a composite FK can
-- point at table_zones / restaurant_tables (ADR-0020 I-2) — created before the
-- Foreign Keys section below because Postgres requires the referenced composite
-- to already be backed by a unique index/constraint (mirrors baseline.sql's own
-- ordering: locations_id_tenant_uq at line 879 precedes the FKs that use it).
-- The two `_active_uq` indexes are partial — archived rows may repeat a name/number
-- (TBL-04's "rename after archive" acceptance criterion depends on this).

CREATE UNIQUE INDEX table_zones_id_tenant_uq ON public.table_zones (id, tenant_id);
--> statement-breakpoint
CREATE UNIQUE INDEX restaurant_tables_id_tenant_uq ON public.restaurant_tables (id, tenant_id);
--> statement-breakpoint
CREATE UNIQUE INDEX table_zones_location_name_active_uq ON public.table_zones (tenant_id, location_id, name) WHERE status = 'active';
--> statement-breakpoint
CREATE UNIQUE INDEX restaurant_tables_zone_number_active_uq ON public.restaurant_tables (tenant_id, zone_id, number) WHERE status = 'active';
--> statement-breakpoint
CREATE INDEX table_zones_location_idx ON public.table_zones (tenant_id, location_id, status);
--> statement-breakpoint
CREATE INDEX restaurant_tables_zone_ordinal_idx ON public.restaurant_tables (tenant_id, zone_id, status, ordinal);
--> statement-breakpoint

-- Foreign keys. ADR-0020 I-2: composite (child_id, tenant_id) -> parent(id, tenant_id)
-- on every tenant-scoped parent link; a cross-tenant id is rejected by Postgres,
-- not by application code (CONTEXT threat T-10.3-01).

ALTER TABLE ONLY public.table_zones
    ADD CONSTRAINT table_zones_tenant_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY public.table_zones
    ADD CONSTRAINT table_zones_location_fk FOREIGN KEY (location_id, tenant_id) REFERENCES public.locations(id, tenant_id) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE ONLY public.restaurant_tables
    ADD CONSTRAINT restaurant_tables_tenant_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY public.restaurant_tables
    ADD CONSTRAINT restaurant_tables_zone_fk FOREIGN KEY (zone_id, tenant_id) REFERENCES public.table_zones(id, tenant_id) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE ONLY public.restaurant_tables
    ADD CONSTRAINT restaurant_tables_location_fk FOREIGN KEY (location_id, tenant_id) REFERENCES public.locations(id, tenant_id) ON DELETE RESTRICT;
--> statement-breakpoint

-- RLS. Pattern 1 (RESEARCH.md): tenant PERMISSIVE + location RESTRICTIVE, copied
-- verbatim from menu_stop_list_iso / menu_stop_list_location_iso
-- (0000_baseline.sql:1175-1179) — the only existing table with both policies.
-- `ScopedTx` filters tenant only (packages/db/src/client.ts:80,123); a zone or
-- table id necessarily appears in a route path for rename/archive, so the
-- RESTRICTIVE policy is the only DB-layer defense against a forged id in that
-- path (CONTEXT D-20 / CTO BLOCK-2). The repository adds the same predicate
-- explicitly as the second layer (ADR-0020 I-1), wired in plan 10.3-05.

ALTER TABLE public.table_zones ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY table_zones_iso ON public.table_zones USING ((public.is_system_session() OR (tenant_id = public.current_tenant_id()))) WITH CHECK ((public.is_system_session() OR (tenant_id = public.current_tenant_id())));
--> statement-breakpoint
CREATE POLICY table_zones_location_iso ON public.table_zones AS RESTRICTIVE USING ((public.is_system_session() OR (public.current_location_id() IS NULL) OR (location_id = public.current_location_id()))) WITH CHECK ((public.is_system_session() OR (public.current_location_id() IS NULL) OR (location_id = public.current_location_id())));
--> statement-breakpoint
ALTER TABLE public.restaurant_tables ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY restaurant_tables_iso ON public.restaurant_tables USING ((public.is_system_session() OR (tenant_id = public.current_tenant_id()))) WITH CHECK ((public.is_system_session() OR (tenant_id = public.current_tenant_id())));
--> statement-breakpoint
CREATE POLICY restaurant_tables_location_iso ON public.restaurant_tables AS RESTRICTIVE USING ((public.is_system_session() OR (public.current_location_id() IS NULL) OR (location_id = public.current_location_id()))) WITH CHECK ((public.is_system_session() OR (public.current_location_id() IS NULL) OR (location_id = public.current_location_id())));
--> statement-breakpoint

-- orders gains the resolved-table snapshot (TBL-08/D-22). Precedence rule for every
-- reader (feed, detail sheet, receipts): render table_zone_name/table_number when
-- present, fall back to table_identifier when both are null, render nothing when
-- all three are null. table_identifier keeps existing data (past orders, seeds,
-- any future non-QR path) but has no writer from this phase on (CONTEXT D-03).

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS table_id uuid;
--> statement-breakpoint
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS table_zone_name text;
--> statement-breakpoint
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS table_number text;
--> statement-breakpoint
ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_table_fk FOREIGN KEY (table_id, tenant_id) REFERENCES public.restaurant_tables(id, tenant_id) ON DELETE RESTRICT;
--> statement-breakpoint

-- Runtime grants. DELETE is deliberately not granted — hard deletes are forbidden
-- (CLAUDE.md) and the lifecycle is status = 'archived'. Guarded so this file stays
-- safe to run before resto_app exists (mirrors roles.sql's own guard shape).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'resto_app') THEN
    GRANT SELECT, INSERT, UPDATE ON public.table_zones, public.restaurant_tables TO resto_app;
  END IF;
END
$$;
--> statement-breakpoint

-- tenancy_erase_tenant reproduced verbatim from 0000_baseline.sql:128-248, with
-- exactly two DELETE statements added between the location-scoped children already
-- deleted and `DELETE FROM locations` — restaurant_tables before table_zones,
-- since tables reference zones with ON DELETE RESTRICT. Both are RESTRICT-linked
-- location children; omitting either turns GDPR erasure into a foreign_key_violation
-- for every tenant that ever created a table (CONTEXT D-19 / CTO BLOCK-3 — this
-- exact omission cost migrations 0072/0074/0077 in the pre-squash history).

CREATE OR REPLACE FUNCTION public.tenancy_erase_tenant(p_tenant_id uuid, p_audit_salt text, p_actor_subject text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  orphan_users text[];
BEGIN
  IF current_setting('app.allow_erasure', true) IS DISTINCT FROM p_tenant_id::text THEN
    RAISE EXCEPTION 'tenancy_erase_tenant requires app.allow_erasure to match the target tenant uuid';
  END IF;

  IF p_audit_salt IS NULL OR length(p_audit_salt) < 32 THEN
    RAISE EXCEPTION 'tenancy_erase_tenant requires p_audit_salt of >= 32 chars';
  END IF;

  IF p_actor_subject IS NULL OR length(p_actor_subject) = 0 THEN
    RAISE EXCEPTION 'tenancy_erase_tenant requires non-empty p_actor_subject';
  END IF;

  INSERT INTO audit_log (
    tenant_id, actor_kind, actor_subject, action, target_type, target_id
  ) VALUES (
    NULL, 'system', p_actor_subject, 'tenant_erased', 'tenant', p_tenant_id::text
  );

  SELECT array_agg(user_id) INTO orphan_users
  FROM member
  WHERE tenant_id = p_tenant_id;

  DELETE FROM outbox_events WHERE tenant_id = p_tenant_id;
  DELETE FROM inbox_processed WHERE tenant_id = p_tenant_id;

  DELETE FROM order_daily_sequences WHERE tenant_id = p_tenant_id;
  DELETE FROM order_modifiers WHERE tenant_id = p_tenant_id;
  DELETE FROM order_items WHERE tenant_id = p_tenant_id;
  DELETE FROM payment_refunds WHERE tenant_id = p_tenant_id;
  DELETE FROM payments WHERE tenant_id = p_tenant_id;
  DELETE FROM orders WHERE tenant_id = p_tenant_id;

  DELETE FROM menu_stop_list WHERE tenant_id = p_tenant_id;
  DELETE FROM menu_item_slug_aliases WHERE tenant_id = p_tenant_id;
  DELETE FROM menu_item_modifier_groups WHERE tenant_id = p_tenant_id;
  DELETE FROM menu_modifier_options WHERE tenant_id = p_tenant_id;
  DELETE FROM menu_modifier_groups WHERE tenant_id = p_tenant_id;
  DELETE FROM menu_item_sizes WHERE tenant_id = p_tenant_id;
  DELETE FROM menu_items WHERE tenant_id = p_tenant_id;
  DELETE FROM menu_categories WHERE tenant_id = p_tenant_id;

  DELETE FROM customer_profiles WHERE tenant_id = p_tenant_id;
  DELETE FROM invitation WHERE tenant_id = p_tenant_id;
  DELETE FROM tenant_role WHERE tenant_id = p_tenant_id;
  DELETE FROM member WHERE tenant_id = p_tenant_id;
  DELETE FROM tenant_domains WHERE tenant_id = p_tenant_id;

  DELETE FROM catalog_location_stop_version WHERE tenant_id = p_tenant_id;
  DELETE FROM member_location_scope WHERE tenant_id = p_tenant_id;
  DELETE FROM restaurant_tables WHERE tenant_id = p_tenant_id;
  DELETE FROM table_zones WHERE tenant_id = p_tenant_id;
  DELETE FROM locations WHERE tenant_id = p_tenant_id;

  -- D-04: legal_name/legal_form/tax_id/stripe_account_id moved here from the
  -- now-dropped `brands` table. `tenants` survives erasure (hard deletes are
  -- forbidden; it is the tombstoned root aggregate) so these must be
  -- explicitly anonymized rather than removed by DELETE.
  UPDATE tenants
  SET
    legal_name = NULL,
    legal_form = NULL,
    tax_id = NULL,
    stripe_account_id = NULL,
    updated_at = now()
  WHERE id = p_tenant_id;

  UPDATE audit_log
  SET
    actor_subject = 'erased:' || encode(digest(p_audit_salt || actor_subject, 'sha256'), 'hex'),
    target_id = CASE
      WHEN target_id IS NULL THEN NULL
      ELSE 'erased:' || encode(digest(p_audit_salt || target_id, 'sha256'), 'hex')
    END,
    ip_address = NULL,
    user_agent = NULL,
    payload = (
      CASE
        WHEN payload IS NULL THEN NULL
        ELSE jsonb_set_lax(
               jsonb_set_lax(
                 jsonb_set_lax(
                   CASE
                     WHEN payload ? 'userId' AND jsonb_typeof(payload->'userId') = 'string'
                     THEN jsonb_set(
                            payload,
                            '{userId}',
                            to_jsonb('erased:' || encode(digest(p_audit_salt || (payload->>'userId'), 'sha256'), 'hex'))
                          )
                     ELSE payload
                   END,
                   '{ipAddress}',
                   NULL,
                   false,
                   'use_json_null'
                 ),
                 '{userAgent}',
                 NULL,
                 false,
                 'use_json_null'
               ),
               '{email}',
               NULL,
               false,
               'use_json_null'
             )
      END
    )
  WHERE tenant_id = p_tenant_id;

  IF orphan_users IS NOT NULL AND array_length(orphan_users, 1) > 0 THEN
    DELETE FROM "user"
    WHERE id = ANY(orphan_users)
      AND NOT EXISTS (SELECT 1 FROM member WHERE member.user_id = "user".id);
  END IF;
END;
$$;
