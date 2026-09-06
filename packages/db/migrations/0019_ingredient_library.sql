-- Ingredient library: options become tenant-level entities via two link tables
-- (menu_modifier_group_options, menu_item_modifier_options), a per-location
-- ingredient stop list (menu_option_stop_list), and a group display/behaviour
-- reshape (D-11/D-33). Hand-written, not `drizzle-kit generate`: the 0000
-- baseline came from pg_dump so drizzle has no snapshot to diff against
-- (D-31, .planning/todos/pending/drizzle-generate-is-broken.md).

CREATE TABLE public.menu_modifier_group_options (
    tenant_id uuid NOT NULL,
    modifier_group_id uuid NOT NULL,
    option_id uuid NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE ONLY public.menu_modifier_group_options FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE TABLE public.menu_item_modifier_options (
    tenant_id uuid NOT NULL,
    menu_item_id uuid NOT NULL,
    option_id uuid NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE ONLY public.menu_item_modifier_options FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE TABLE public.menu_option_stop_list (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    location_id uuid NOT NULL,
    option_id uuid NOT NULL,
    stopped_at timestamp with time zone DEFAULT now() NOT NULL,
    reason text,
    stopped_by_user_id text,
    CONSTRAINT menu_option_stop_list_pkey PRIMARY KEY (id)
);
--> statement-breakpoint
ALTER TABLE ONLY public.menu_option_stop_list FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

-- Indexes before FKs — Postgres requires the referenced (id, tenant_id) unique
-- index to exist before a composite FK can point at it (mirrors 0003's own
-- ordering). The two link tables have no surrogate id (composite PK only, no
-- other table references them), so only menu_option_stop_list gets the new
-- `_id_tenant_uq` pattern (ADR-0020 I-2). menu_modifier_options is an existing
-- table becoming a composite-FK parent for the first time here — it needs the
-- same index even though its own CREATE TABLE predates this migration.

CREATE UNIQUE INDEX menu_modifier_options_id_tenant_uq ON public.menu_modifier_options (id, tenant_id);
--> statement-breakpoint
CREATE UNIQUE INDEX menu_option_stop_list_id_tenant_uq ON public.menu_option_stop_list (id, tenant_id);
--> statement-breakpoint
CREATE UNIQUE INDEX menu_option_stop_list_location_option_tenant_uq ON public.menu_option_stop_list (tenant_id, location_id, option_id);
--> statement-breakpoint
CREATE INDEX menu_modifier_group_options_tenant_group_idx ON public.menu_modifier_group_options (tenant_id, modifier_group_id, sort_order);
--> statement-breakpoint
CREATE INDEX menu_item_modifier_options_tenant_item_idx ON public.menu_item_modifier_options (tenant_id, menu_item_id, sort_order);
--> statement-breakpoint
CREATE INDEX menu_modifier_options_tenant_sort_idx ON public.menu_modifier_options (tenant_id, sort_order);
--> statement-breakpoint

-- Primary keys and foreign keys. ADR-0020 I-2: composite (child_id, tenant_id)
-- -> parent(id, tenant_id) on every tenant-scoped parent link.

ALTER TABLE ONLY public.menu_modifier_group_options
    ADD CONSTRAINT menu_modifier_group_options_pk PRIMARY KEY (modifier_group_id, option_id);
--> statement-breakpoint
ALTER TABLE ONLY public.menu_modifier_group_options
    ADD CONSTRAINT menu_modifier_group_options_tenant_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY public.menu_modifier_group_options
    ADD CONSTRAINT menu_modifier_group_options_group_fk FOREIGN KEY (modifier_group_id, tenant_id) REFERENCES public.menu_modifier_groups(id, tenant_id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY public.menu_modifier_group_options
    ADD CONSTRAINT menu_modifier_group_options_option_fk FOREIGN KEY (option_id, tenant_id) REFERENCES public.menu_modifier_options(id, tenant_id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY public.menu_item_modifier_options
    ADD CONSTRAINT menu_item_modifier_options_pk PRIMARY KEY (menu_item_id, option_id);
--> statement-breakpoint
ALTER TABLE ONLY public.menu_item_modifier_options
    ADD CONSTRAINT menu_item_modifier_options_tenant_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY public.menu_item_modifier_options
    ADD CONSTRAINT menu_item_modifier_options_item_fk FOREIGN KEY (menu_item_id, tenant_id) REFERENCES public.menu_items(id, tenant_id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY public.menu_item_modifier_options
    ADD CONSTRAINT menu_item_modifier_options_option_fk FOREIGN KEY (option_id, tenant_id) REFERENCES public.menu_modifier_options(id, tenant_id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY public.menu_option_stop_list
    ADD CONSTRAINT menu_option_stop_list_tenant_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY public.menu_option_stop_list
    ADD CONSTRAINT menu_option_stop_list_option_fk FOREIGN KEY (option_id, tenant_id) REFERENCES public.menu_modifier_options(id, tenant_id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY public.menu_option_stop_list
    ADD CONSTRAINT menu_option_stop_list_location_fk FOREIGN KEY (location_id, tenant_id) REFERENCES public.locations(id, tenant_id) ON DELETE RESTRICT;
--> statement-breakpoint

-- RLS. Pattern 1 (RESEARCH.md): tenant PERMISSIVE on all three, plus a second
-- location RESTRICTIVE policy on menu_option_stop_list, copied verbatim from
-- menu_modifier_options_iso / menu_stop_list_iso / menu_stop_list_location_iso
-- (0000_baseline.sql:1171-1179).

ALTER TABLE public.menu_modifier_group_options ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY menu_modifier_group_options_iso ON public.menu_modifier_group_options USING ((public.is_system_session() OR (tenant_id = public.current_tenant_id()))) WITH CHECK ((public.is_system_session() OR (tenant_id = public.current_tenant_id())));
--> statement-breakpoint
ALTER TABLE public.menu_item_modifier_options ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY menu_item_modifier_options_iso ON public.menu_item_modifier_options USING ((public.is_system_session() OR (tenant_id = public.current_tenant_id()))) WITH CHECK ((public.is_system_session() OR (tenant_id = public.current_tenant_id())));
--> statement-breakpoint
ALTER TABLE public.menu_option_stop_list ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY menu_option_stop_list_iso ON public.menu_option_stop_list USING ((public.is_system_session() OR (tenant_id = public.current_tenant_id()))) WITH CHECK ((public.is_system_session() OR (tenant_id = public.current_tenant_id())));
--> statement-breakpoint
CREATE POLICY menu_option_stop_list_location_iso ON public.menu_option_stop_list AS RESTRICTIVE USING ((public.is_system_session() OR (public.current_location_id() IS NULL) OR (location_id = public.current_location_id()))) WITH CHECK ((public.is_system_session() OR (public.current_location_id() IS NULL) OR (location_id = public.current_location_id())));
--> statement-breakpoint

-- menu_modifier_options gains its own identity fields (D-01/D-03: an option is
-- a tenant-level entity, no longer scoped to a single group by ownership).

ALTER TABLE public.menu_modifier_options
    ADD COLUMN IF NOT EXISTS description jsonb,
    ADD COLUMN IF NOT EXISTS image_s3_key text,
    ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual' NOT NULL,
    ADD COLUMN IF NOT EXISTS source_external_id text;
--> statement-breakpoint
ALTER TABLE public.menu_modifier_options
    ADD CONSTRAINT menu_modifier_options_source_chk CHECK (source IN ('manual','ai_generated','imported_iiko','imported_csv'));
--> statement-breakpoint

-- menu_modifier_groups: display/behaviour replace the numeric min/max range
-- (D-07/D-33). The UPDATE derives the new columns from the old numbers before
-- the DROP below removes them — D-11's migration-time derivation, no operator
-- action. max_selectable = 0 meant "unlimited" in the old admin and lands on
-- tiles+several with every other non-1 value.

ALTER TABLE public.menu_modifier_groups
    ADD COLUMN IF NOT EXISTS display text DEFAULT 'tiles' NOT NULL,
    ADD COLUMN IF NOT EXISTS behaviour text DEFAULT 'several' NOT NULL;
--> statement-breakpoint
UPDATE public.menu_modifier_groups
SET display = CASE WHEN max_selectable = 1 THEN 'tabs' ELSE 'tiles' END,
    behaviour = CASE WHEN max_selectable = 1 THEN 'one' ELSE 'several' END;
--> statement-breakpoint
ALTER TABLE public.menu_modifier_groups
    ADD CONSTRAINT menu_modifier_groups_display_chk CHECK (display IN ('tiles','tabs'));
--> statement-breakpoint
ALTER TABLE public.menu_modifier_groups
    ADD CONSTRAINT menu_modifier_groups_behaviour_chk CHECK (behaviour IN ('one','several'));
--> statement-breakpoint
ALTER TABLE public.menu_modifier_groups DROP CONSTRAINT IF EXISTS menu_modifier_groups_selectable_range_chk;
--> statement-breakpoint
ALTER TABLE public.menu_modifier_groups
    DROP COLUMN IF EXISTS min_selectable,
    DROP COLUMN IF EXISTS max_selectable;
--> statement-breakpoint

-- The option's membership moves out of a direct FK column and into the new
-- link table (D-02). The dev database is reset (D-30) so this SELECT will
-- usually copy zero rows — written anyway so the file is a correct migration,
-- not a dev-only script.

INSERT INTO public.menu_modifier_group_options (tenant_id, modifier_group_id, option_id, sort_order)
SELECT tenant_id, modifier_group_id, id, sort_order FROM public.menu_modifier_options;
--> statement-breakpoint
ALTER TABLE public.menu_modifier_options DROP CONSTRAINT IF EXISTS menu_modifier_options_group_fk;
--> statement-breakpoint
DROP INDEX IF EXISTS public.menu_modifier_options_tenant_group_idx;
--> statement-breakpoint
ALTER TABLE public.menu_modifier_options DROP COLUMN IF EXISTS modifier_group_id;
--> statement-breakpoint

-- menu_items: composition replaces ingredients (D-13), gains the two-mode
-- authoring flow (D-14/D-15) and the GIN index the assembled-mode reads use.

ALTER TABLE public.menu_items RENAME COLUMN ingredients TO composition;
--> statement-breakpoint
ALTER TABLE public.menu_items
    ADD COLUMN IF NOT EXISTS composition_mode text DEFAULT 'text' NOT NULL,
    ADD COLUMN IF NOT EXISTS composition_assembled jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE public.menu_items
    ADD CONSTRAINT menu_items_composition_mode_chk CHECK (composition_mode IN ('text','assembled'));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS menu_items_composition_assembled_gin_idx ON public.menu_items USING gin (composition_assembled jsonb_path_ops);
--> statement-breakpoint

-- order_modifiers: kind discriminates an added modifier from an excluded
-- composition line (D-34). Every existing row defaults to 'added'.

ALTER TABLE public.order_modifiers
    ADD COLUMN IF NOT EXISTS kind text DEFAULT 'added' NOT NULL;
--> statement-breakpoint
ALTER TABLE public.order_modifiers
    ADD CONSTRAINT order_modifiers_kind_chk CHECK (kind IN ('added','excluded'));
--> statement-breakpoint

-- Runtime grants. SELECT/INSERT/UPDATE for the usual write paths; DELETE is
-- additionally granted on all three because membership is written
-- delete-then-reinsert (the replaceItemModifierGroups precedent) and unstop
-- is a real hard delete (the menu_stop_list precedent). Guarded so this file
-- stays safe to run before resto_app exists (mirrors roles.sql's own guard
-- shape).

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'resto_app') THEN
    GRANT SELECT, INSERT, UPDATE ON public.menu_modifier_group_options, public.menu_item_modifier_options, public.menu_option_stop_list TO resto_app;
    GRANT DELETE ON public.menu_modifier_group_options, public.menu_item_modifier_options, public.menu_option_stop_list TO resto_app;
  END IF;
END
$$;
--> statement-breakpoint

-- tenancy_erase_tenant reproduced verbatim from 0003_table_zones_and_tables.sql,
-- with three new DELETE statements inserted immediately above the existing
-- `DELETE FROM menu_item_modifier_groups` line, in FK-safe order:
-- menu_option_stop_list, then menu_item_modifier_options, then
-- menu_modifier_group_options — all three are children of
-- menu_modifier_options, which the existing block deletes further down.
--
-- Three tenant-scoped tables created in migrations 0004-0018 (table_sessions,
-- order_feedback, service_requests) are NOT in this function and are left
-- untouched here — adding them changes erasure semantics outside this phase's
-- scope; see 10.6-02-SUMMARY.md for this finding.

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
  DELETE FROM menu_option_stop_list WHERE tenant_id = p_tenant_id;
  DELETE FROM menu_item_modifier_options WHERE tenant_id = p_tenant_id;
  DELETE FROM menu_modifier_group_options WHERE tenant_id = p_tenant_id;
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
