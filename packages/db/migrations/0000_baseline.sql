-- Squashed baseline, generated 2026-08-23 from the schema produced by
-- migrations 0000-0081 (phase 10.2, FINDINGS F-18).
--
-- Produced by `pg_dump --schema-only --no-owner --no-privileges --exclude-schema=drizzle`
-- against a database at migration 0081, then split into drizzle statements.
-- Proven by applying this file alone through the real drizzle migrator to an
-- empty database and diffing the resulting dump against the reference: zero
-- semantic differences, identical object counts (32 tables, 78 indexes,
-- 115 constraints, 40 policies, 121 functions, 27 RLS-enabled tables).
--
-- The pre-squash chain is in git history.
--
-- Databases created BEFORE the squash keep working: their 82 migration rows all
-- carry timestamps newer than this baseline's, so drizzle treats it as already
-- applied and `db:migrate` is a no-op. Verified on a copy of the dev database —
-- data intact, nothing re-run. A fresh database gets this file instead.
--
-- The squash is cheap now because there is no production database. It would not
-- be later.
--
-- Role GRANTS are NOT here: `packages/db/sql/roles.sql` and `auth-role.sql` are applied separately
-- by `provision-roles-ci.ts`, after migrate. Role EXISTENCE is, because the policies below name
-- resto_auth and the migrator runs before any provisioning.
--
-- WARNING for whoever regenerates this file. `pg_dump --no-privileges` emits no GRANT and no REVOKE,
-- and a dump-to-dump diff cannot see what both sides are equally blind to. The first squash lost all
-- five function REVOKEs that way — including EXECUTE on `tenancy_erase_tenant` — and nobody noticed
-- because it was only ever applied to databases that already had them. Re-verify against an EMPTY
-- database, and check the REVOKE block at the end of this file by hand.

-- resto_auth is created NOLOGIN and without a password; provisionAuthRole later grants it LOGIN, a
-- password and table privileges. Here it only has to exist so the policies below can name it.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'resto_auth') THEN
    CREATE ROLE resto_auth NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
END
$$;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;
--> statement-breakpoint
COMMENT ON EXTENSION citext IS 'data type for case-insensitive character strings';
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;
--> statement-breakpoint
COMMENT ON EXTENSION pg_trgm IS 'text similarity measurement and index searching based on trigrams';
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;
--> statement-breakpoint
COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';
--> statement-breakpoint
CREATE FUNCTION public.app_allow_erasure(p_tenant uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN
  PERFORM set_config('app.allow_erasure', p_tenant::text, true);
END
$$;
--> statement-breakpoint
CREATE FUNCTION public.app_bind_location(p_location text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_current TEXT := current_setting('app.current_location', true);
BEGIN
  IF v_current IS NOT NULL AND v_current <> '' AND v_current <> p_location THEN
    RAISE EXCEPTION
      'app.current_location already bound to % — refusing to rebind to %',
      v_current, p_location
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM set_config('app.current_location', p_location, true);
END
$$;
--> statement-breakpoint
CREATE FUNCTION public.app_bind_tenant(p_tenant text, p_is_system boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_current TEXT := current_setting('app.current_tenant', true);
BEGIN
  IF v_current IS NOT NULL AND v_current <> '' AND v_current <> p_tenant THEN
    RAISE EXCEPTION
      'app.current_tenant already bound to % — refusing to rebind to %',
      v_current, p_tenant
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM set_config('app.current_tenant', p_tenant, true);
  PERFORM set_config(
    'app.is_system',
    CASE WHEN p_is_system THEN 'true' ELSE 'false' END,
    true
  );
END
$$;
--> statement-breakpoint
CREATE FUNCTION public.current_location_id() RETURNS uuid
    LANGUAGE sql STABLE PARALLEL SAFE
    AS $$
  SELECT nullif(current_setting('app.current_location', true), '')::uuid;
$$;
--> statement-breakpoint
COMMENT ON FUNCTION public.current_location_id() IS 'Returns the location uuid bound to the current transaction by the tenant-aware client, or NULL if none is bound.';
--> statement-breakpoint
CREATE FUNCTION public.current_tenant_id() RETURNS uuid
    LANGUAGE sql STABLE PARALLEL SAFE
    AS $$
  SELECT nullif(current_setting('app.current_tenant', true), '')::uuid;
$$;
--> statement-breakpoint
COMMENT ON FUNCTION public.current_tenant_id() IS 'Returns the tenant uuid bound to the current transaction by the tenant-aware client, or NULL if none is bound.';
--> statement-breakpoint
CREATE FUNCTION public.is_system_session() RETURNS boolean
    LANGUAGE sql STABLE PARALLEL SAFE
    AS $$
  SELECT coalesce(
    nullif(current_setting('app.is_system', true), ''),
    'false'
  )::boolean;
$$;
--> statement-breakpoint
COMMENT ON FUNCTION public.is_system_session() IS 'Returns true when the current transaction was opened via withoutTenant() in packages/db.';
--> statement-breakpoint
CREATE FUNCTION public.tenancy_erase_tenant(p_tenant_id uuid, p_audit_salt text, p_actor_subject text) RETURNS void
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
--> statement-breakpoint
CREATE TABLE public.account (
    id text NOT NULL,
    account_id text NOT NULL,
    provider_id text NOT NULL,
    user_id text NOT NULL,
    access_token text,
    refresh_token text,
    id_token text,
    access_token_expires_at timestamp without time zone,
    refresh_token_expires_at timestamp without time zone,
    scope text,
    password text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE public.audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid,
    actor_kind text NOT NULL,
    actor_subject text NOT NULL,
    action text NOT NULL,
    target_type text,
    target_id text,
    payload jsonb,
    ip_address text,
    user_agent text,
    correlation_id uuid,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT audit_log_actor_kind_chk CHECK ((actor_kind = ANY (ARRAY['platform_user'::text, 'tenant_user'::text, 'system'::text, 'service'::text])))
);
--> statement-breakpoint
ALTER TABLE ONLY public.audit_log FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE TABLE public.catalog_location_stop_version (
    location_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    stop_version bigint DEFAULT 1 NOT NULL
);
--> statement-breakpoint
ALTER TABLE ONLY public.catalog_location_stop_version FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE TABLE public.catalog_menu_version (
    tenant_id uuid NOT NULL,
    menu_version bigint DEFAULT 1 NOT NULL
);
--> statement-breakpoint
ALTER TABLE ONLY public.catalog_menu_version FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE TABLE public.customer_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    tenant_id uuid NOT NULL,
    display_name text,
    loyalty_points integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    archived_at timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE ONLY public.customer_profiles FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE TABLE public.inbox_processed (
    event_id character varying(255) NOT NULL,
    consumer text NOT NULL,
    tenant_id uuid,
    processed_at timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE ONLY public.inbox_processed FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE TABLE public.invitation (
    id text NOT NULL,
    tenant_id uuid NOT NULL,
    email text NOT NULL,
    role text,
    status text DEFAULT 'pending'::text NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    inviter_id text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE ONLY public.invitation FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE TABLE public.locations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    address text,
    timezone text,
    contacts jsonb,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    archived_at timestamp with time zone,
    CONSTRAINT locations_status_chk CHECK ((status = ANY (ARRAY['active'::text, 'archived'::text])))
);
--> statement-breakpoint
ALTER TABLE ONLY public.locations FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE TABLE public.member (
    id text NOT NULL,
    tenant_id uuid NOT NULL,
    user_id text NOT NULL,
    role text DEFAULT 'member'::text NOT NULL,
    created_at timestamp without time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE ONLY public.member FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE TABLE public.member_location_scope (
    member_id text NOT NULL,
    location_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    role text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    archived_at timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE ONLY public.member_location_scope FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE TABLE public.menu_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    slug text NOT NULL,
    name jsonb NOT NULL,
    description jsonb,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    archived_at timestamp with time zone,
    parent_id uuid,
    status text DEFAULT 'draft'::text NOT NULL,
    code text,
    CONSTRAINT menu_categories_slug_format_chk CHECK ((slug ~ '^[a-z0-9][a-z0-9-]*$'::text)),
    CONSTRAINT menu_categories_status_chk CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text])))
);
--> statement-breakpoint
ALTER TABLE ONLY public.menu_categories FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE TABLE public.menu_item_modifier_groups (
    tenant_id uuid NOT NULL,
    menu_item_id uuid NOT NULL,
    modifier_group_id uuid NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE ONLY public.menu_item_modifier_groups FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE TABLE public.menu_item_sizes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    menu_item_id uuid NOT NULL,
    name jsonb NOT NULL,
    price numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    archived_at timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE ONLY public.menu_item_sizes FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE TABLE public.menu_item_slug_aliases (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    item_id uuid NOT NULL,
    alias text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT menu_item_slug_aliases_format_chk CHECK ((alias ~ '^[a-z0-9][a-z0-9-]*$'::text))
);
--> statement-breakpoint
ALTER TABLE ONLY public.menu_item_slug_aliases FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE TABLE public.menu_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    category_id uuid NOT NULL,
    slug text NOT NULL,
    name jsonb NOT NULL,
    description jsonb,
    base_price numeric(12,2) NOT NULL,
    currency text NOT NULL,
    allergens text[],
    status text DEFAULT 'draft'::text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    archived_at timestamp with time zone,
    photos jsonb DEFAULT '[]'::jsonb NOT NULL,
    proteins numeric(5,2),
    fats numeric(5,2),
    carbs numeric(5,2),
    kcal smallint,
    nutrition_estimated boolean DEFAULT false NOT NULL,
    source text DEFAULT 'manual'::text NOT NULL,
    needs_review boolean DEFAULT false NOT NULL,
    source_external_id text,
    ingredients text[],
    meta_title text,
    meta_description text,
    code text,
    weight numeric(10,3),
    measure_unit text,
    CONSTRAINT menu_items_base_price_nonneg_chk CHECK (((base_price)::numeric >= (0)::numeric)),
    CONSTRAINT menu_items_currency_format_chk CHECK ((currency ~ '^[A-Z]{3}$'::text)),
    CONSTRAINT menu_items_measure_unit_chk CHECK (((measure_unit IS NULL) OR (measure_unit = ANY (ARRAY['g'::text, 'kg'::text, 'ml'::text, 'l'::text, 'pcs'::text])))),
    CONSTRAINT menu_items_slug_format_chk CHECK ((slug ~ '^[a-z0-9][a-z0-9-]*$'::text)),
    CONSTRAINT menu_items_source_chk CHECK ((source = ANY (ARRAY['manual'::text, 'ai_generated'::text, 'imported_iiko'::text, 'imported_csv'::text]))),
    CONSTRAINT menu_items_status_chk CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text]))),
    CONSTRAINT menu_items_weight_nonneg_chk CHECK (((weight IS NULL) OR (weight >= (0)::numeric)))
);
--> statement-breakpoint
ALTER TABLE ONLY public.menu_items FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE TABLE public.menu_modifier_groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    name jsonb NOT NULL,
    min_selectable integer DEFAULT 0 NOT NULL,
    max_selectable integer DEFAULT 1 NOT NULL,
    is_required boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    archived_at timestamp with time zone,
    CONSTRAINT menu_modifier_groups_selectable_range_chk CHECK (((min_selectable >= 0) AND (max_selectable >= min_selectable)))
);
--> statement-breakpoint
ALTER TABLE ONLY public.menu_modifier_groups FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE TABLE public.menu_modifier_options (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    modifier_group_id uuid NOT NULL,
    name jsonb NOT NULL,
    price_delta numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    archived_at timestamp with time zone,
    default_amount smallint DEFAULT 0 NOT NULL,
    free_amount smallint DEFAULT 0 NOT NULL,
    min_amount smallint,
    max_amount smallint,
    CONSTRAINT menu_modifier_options_amount_nonneg_chk CHECK (((min_amount IS NULL) OR (min_amount >= 0))),
    CONSTRAINT menu_modifier_options_amount_order_chk CHECK (((min_amount IS NULL) OR (max_amount IS NULL) OR (max_amount >= min_amount)))
);
--> statement-breakpoint
ALTER TABLE ONLY public.menu_modifier_options FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE TABLE public.menu_stop_list (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    item_id uuid NOT NULL,
    stopped_at timestamp with time zone DEFAULT now() NOT NULL,
    reason text,
    stopped_by_user_id text,
    location_id uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE ONLY public.menu_stop_list FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE SEQUENCE public.menu_versions_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
--> statement-breakpoint
CREATE TABLE public.order_daily_sequences (
    tenant_id uuid NOT NULL,
    location_id uuid NOT NULL,
    business_date date NOT NULL,
    counter integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE ONLY public.order_daily_sequences FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE TABLE public.order_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    order_id uuid NOT NULL,
    menu_item_id uuid NOT NULL,
    name_snapshot text NOT NULL,
    unit_price numeric(12,2) NOT NULL,
    quantity smallint DEFAULT 1 NOT NULL,
    line_total numeric(12,2) NOT NULL,
    currency text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE ONLY public.order_items FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE TABLE public.order_modifiers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    order_item_id uuid NOT NULL,
    option_id uuid NOT NULL,
    name_snapshot text NOT NULL,
    price_delta numeric(12,2) NOT NULL,
    amount smallint DEFAULT 1 NOT NULL,
    modifier_group_id uuid
);
--> statement-breakpoint
ALTER TABLE ONLY public.order_modifiers FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE TABLE public.orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    idempotency_key text NOT NULL,
    order_number text NOT NULL,
    status text NOT NULL,
    fulfillment_mode text NOT NULL,
    table_identifier text,
    customer_name text,
    customer_phone text,
    subtotal numeric(12,2) NOT NULL,
    delivery_fee numeric(12,2) DEFAULT 0.00 NOT NULL,
    service_fee numeric(12,2) DEFAULT 0.00 NOT NULL,
    discount numeric(12,2) DEFAULT 0.00 NOT NULL,
    total numeric(12,2) NOT NULL,
    currency text NOT NULL,
    scheduled_for timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    customer_email text,
    location_id uuid NOT NULL,
    short_number integer NOT NULL,
    channel text DEFAULT 'site'::text NOT NULL,
    accepted_at timestamp with time zone,
    preparing_at timestamp with time zone,
    ready_at timestamp with time zone,
    completed_at timestamp with time zone,
    canceled_at timestamp with time zone,
    accepted_by_user_id text,
    canceled_by_user_id text,
    cancel_reason text,
    cancel_note text,
    canceled_from_status text,
    eta_at timestamp with time zone,
    marketing_consent boolean DEFAULT false NOT NULL,
    marketing_consent_at timestamp with time zone,
    CONSTRAINT orders_cancel_reason_chk CHECK (((cancel_reason IS NULL) OR (cancel_reason = ANY (ARRAY['guest_no_show'::text, 'kitchen_out_of_stock'::text, 'kitchen_too_busy'::text, 'guest_requested'::text, 'payment_issue'::text, 'duplicate_order'::text, 'other'::text])))),
    CONSTRAINT orders_canceled_from_status_chk CHECK (((canceled_from_status IS NULL) OR (canceled_from_status = ANY (ARRAY['created'::text, 'requires_action'::text, 'paid'::text, 'accepted'::text, 'preparing'::text, 'ready'::text, 'completed'::text, 'canceled'::text, 'refunded'::text, 'failed'::text])))),
    CONSTRAINT orders_channel_chk CHECK ((channel = ANY (ARRAY['site'::text, 'qr-menu'::text]))),
    CONSTRAINT orders_fulfillment_mode_chk CHECK ((fulfillment_mode = ANY (ARRAY['dine_in'::text, 'pickup'::text, 'delivery'::text]))),
    CONSTRAINT orders_status_chk CHECK ((status = ANY (ARRAY['created'::text, 'requires_action'::text, 'paid'::text, 'accepted'::text, 'preparing'::text, 'ready'::text, 'completed'::text, 'canceled'::text, 'refunded'::text, 'failed'::text])))
);
--> statement-breakpoint
ALTER TABLE ONLY public.orders FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE TABLE public.outbox_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid,
    aggregate_id uuid,
    type text NOT NULL,
    payload jsonb NOT NULL,
    headers jsonb DEFAULT '{}'::jsonb NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    claimed_at timestamp with time zone,
    delivered_at timestamp with time zone,
    claim_id uuid,
    CONSTRAINT outbox_events_type_format_chk CHECK ((type ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+\.v[0-9]+$'::text))
);
--> statement-breakpoint
ALTER TABLE ONLY public.outbox_events FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE TABLE public.payment_refunds (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    payment_id uuid NOT NULL,
    stripe_refund_id text,
    amount numeric(12,2) NOT NULL,
    reason text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    refund_request_id text NOT NULL,
    failure_reason text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT payment_refunds_status_chk CHECK ((status = ANY (ARRAY['pending'::text, 'succeeded'::text, 'failed'::text])))
);
--> statement-breakpoint
ALTER TABLE ONLY public.payment_refunds FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE TABLE public.payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    order_id uuid NOT NULL,
    status text NOT NULL,
    amount numeric(12,2) NOT NULL,
    currency text NOT NULL,
    provider text DEFAULT 'stripe'::text NOT NULL,
    provider_payment_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    payment_intent_id text,
    latest_charge_id text,
    refunded_amount numeric(12,2) DEFAULT 0.00 NOT NULL,
    stripe_account_id text,
    application_fee_amount numeric(12,2) DEFAULT 0.00 NOT NULL,
    CONSTRAINT payments_status_chk CHECK ((status = ANY (ARRAY['pending'::text, 'requires_action'::text, 'succeeded'::text, 'failed'::text, 'refunded'::text, 'partially_refunded'::text])))
);
--> statement-breakpoint
ALTER TABLE ONLY public.payments FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE TABLE public.session (
    id text NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    token text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone NOT NULL,
    ip_address text,
    user_agent text,
    user_id text NOT NULL,
    active_tenant_id text,
    active_location_id text
);
--> statement-breakpoint
CREATE TABLE public.tenant_domains (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    domain public.citext NOT NULL,
    kind text NOT NULL,
    is_primary boolean DEFAULT false NOT NULL,
    verified_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    archived_at timestamp with time zone,
    CONSTRAINT tenant_domains_kind_chk CHECK ((kind = ANY (ARRAY['subdomain'::text, 'custom'::text])))
);
--> statement-breakpoint
ALTER TABLE ONLY public.tenant_domains FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE TABLE public.tenant_role (
    id text NOT NULL,
    tenant_id uuid NOT NULL,
    role text NOT NULL,
    permission text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone,
    archived_at timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE ONLY public.tenant_role FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE TABLE public.tenants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug public.citext NOT NULL,
    display_name text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    locale text DEFAULT 'en'::text NOT NULL,
    default_currency text DEFAULT 'USD'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    archived_at timestamp with time zone,
    logo text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    offboarding_scheduled_at timestamp with time zone,
    offboarding_executed_at timestamp with time zone,
    offboarding_requested_by text,
    menu_first_published_at timestamp with time zone,
    theme jsonb,
    legal_name text,
    legal_form text,
    tax_id text,
    stripe_account_id text,
    payment_provider text DEFAULT 'stripe'::text NOT NULL,
    account_type text,
    stripe_charges_enabled boolean DEFAULT false NOT NULL,
    stripe_payouts_enabled boolean DEFAULT false NOT NULL,
    stripe_onboarding_status text DEFAULT 'not_started'::text NOT NULL,
    stripe_requirements_due jsonb,
    fiscalization_config jsonb,
    country text NOT NULL,
    CONSTRAINT tenants_account_type_chk CHECK (((account_type IS NULL) OR (account_type = ANY (ARRAY['express'::text, 'standard'::text])))),
    CONSTRAINT tenants_country_chk CHECK ((country = ANY (ARRAY['UA'::text, 'GB'::text, 'ES'::text]))),
    CONSTRAINT tenants_currency_format_chk CHECK ((default_currency ~ '^[A-Z]{3}$'::text)),
    CONSTRAINT tenants_legal_form_chk CHECK (((legal_form IS NULL) OR (legal_form = ANY (ARRAY['IP'::text, 'OOO'::text, 'LLC'::text, 'SOLE_PROP'::text, 'OTHER'::text])))),
    CONSTRAINT tenants_locale_format_chk CHECK ((locale ~ '^[a-z]{2}(-[A-Z]{2})?$'::text)),
    CONSTRAINT tenants_payment_provider_chk CHECK ((payment_provider = 'stripe'::text)),
    CONSTRAINT tenants_slug_format_chk CHECK ((slug OPERATOR(public.~) '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$'::public.citext)),
    CONSTRAINT tenants_status_chk CHECK ((status = ANY (ARRAY['pending_setup'::text, 'active'::text, 'suspended'::text, 'archived'::text, 'pending_offboarding'::text, 'erased'::text]))),
    CONSTRAINT tenants_stripe_onboarding_status_chk CHECK ((stripe_onboarding_status = ANY (ARRAY['not_started'::text, 'pending'::text, 'complete'::text, 'restricted'::text])))
);
--> statement-breakpoint
ALTER TABLE ONLY public.tenants FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE TABLE public.two_factor (
    id text NOT NULL,
    secret text NOT NULL,
    backup_codes text NOT NULL,
    user_id text NOT NULL
);
--> statement-breakpoint
CREATE TABLE public."user" (
    id text NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    email_verified boolean DEFAULT false NOT NULL,
    image text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    two_factor_enabled boolean DEFAULT false,
    requires_password_change boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE public.verification (
    id text NOT NULL,
    identifier text NOT NULL,
    value text NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE ONLY public.account
    ADD CONSTRAINT account_pkey PRIMARY KEY (id);
--> statement-breakpoint
ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);
--> statement-breakpoint
ALTER TABLE ONLY public.catalog_location_stop_version
    ADD CONSTRAINT catalog_location_stop_version_pk PRIMARY KEY (location_id, tenant_id);
--> statement-breakpoint
ALTER TABLE ONLY public.catalog_menu_version
    ADD CONSTRAINT catalog_menu_version_pkey PRIMARY KEY (tenant_id);
--> statement-breakpoint
ALTER TABLE ONLY public.customer_profiles
    ADD CONSTRAINT customer_profiles_pkey PRIMARY KEY (id);
--> statement-breakpoint
ALTER TABLE ONLY public.inbox_processed
    ADD CONSTRAINT inbox_processed_pkey PRIMARY KEY (event_id, consumer);
--> statement-breakpoint
ALTER TABLE ONLY public.invitation
    ADD CONSTRAINT invitation_pkey PRIMARY KEY (id);
--> statement-breakpoint
ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_pkey PRIMARY KEY (id);
--> statement-breakpoint
ALTER TABLE ONLY public.member_location_scope
    ADD CONSTRAINT member_location_scope_pk PRIMARY KEY (member_id, location_id);
--> statement-breakpoint
ALTER TABLE ONLY public.member
    ADD CONSTRAINT member_pkey PRIMARY KEY (id);
--> statement-breakpoint
ALTER TABLE ONLY public.menu_categories
    ADD CONSTRAINT menu_categories_pkey PRIMARY KEY (id);
--> statement-breakpoint
ALTER TABLE ONLY public.menu_item_modifier_groups
    ADD CONSTRAINT menu_item_modifier_groups_pk PRIMARY KEY (menu_item_id, modifier_group_id);
--> statement-breakpoint
ALTER TABLE ONLY public.menu_item_slug_aliases
    ADD CONSTRAINT menu_item_slug_aliases_pkey PRIMARY KEY (id);
--> statement-breakpoint
ALTER TABLE ONLY public.menu_items
    ADD CONSTRAINT menu_items_pkey PRIMARY KEY (id);
--> statement-breakpoint
ALTER TABLE ONLY public.menu_modifier_options
    ADD CONSTRAINT menu_modifier_options_pkey PRIMARY KEY (id);
--> statement-breakpoint
ALTER TABLE ONLY public.menu_modifier_groups
    ADD CONSTRAINT menu_modifiers_pkey PRIMARY KEY (id);
--> statement-breakpoint
ALTER TABLE ONLY public.menu_stop_list
    ADD CONSTRAINT menu_stop_list_pkey PRIMARY KEY (id);
--> statement-breakpoint
ALTER TABLE ONLY public.menu_item_sizes
    ADD CONSTRAINT menu_variants_pkey PRIMARY KEY (id);
--> statement-breakpoint
ALTER TABLE ONLY public.order_daily_sequences
    ADD CONSTRAINT order_daily_sequences_pk PRIMARY KEY (tenant_id, location_id, business_date);
--> statement-breakpoint
ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);
--> statement-breakpoint
ALTER TABLE ONLY public.order_modifiers
    ADD CONSTRAINT order_modifiers_pkey PRIMARY KEY (id);
--> statement-breakpoint
ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);
--> statement-breakpoint
ALTER TABLE ONLY public.outbox_events
    ADD CONSTRAINT outbox_events_pkey PRIMARY KEY (id);
--> statement-breakpoint
ALTER TABLE ONLY public.payment_refunds
    ADD CONSTRAINT payment_refunds_pkey PRIMARY KEY (id);
--> statement-breakpoint
ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);
--> statement-breakpoint
ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_pkey PRIMARY KEY (id);
--> statement-breakpoint
ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_token_unique UNIQUE (token);
--> statement-breakpoint
ALTER TABLE ONLY public.tenant_domains
    ADD CONSTRAINT tenant_domains_pkey PRIMARY KEY (id);
--> statement-breakpoint
ALTER TABLE ONLY public.tenant_role
    ADD CONSTRAINT tenant_role_pkey PRIMARY KEY (id);
--> statement-breakpoint
ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_pkey PRIMARY KEY (id);
--> statement-breakpoint
ALTER TABLE ONLY public.two_factor
    ADD CONSTRAINT two_factor_pkey PRIMARY KEY (id);
--> statement-breakpoint
ALTER TABLE ONLY public."user"
    ADD CONSTRAINT user_email_unique UNIQUE (email);
--> statement-breakpoint
ALTER TABLE ONLY public."user"
    ADD CONSTRAINT user_pkey PRIMARY KEY (id);
--> statement-breakpoint
ALTER TABLE ONLY public.verification
    ADD CONSTRAINT verification_pkey PRIMARY KEY (id);
--> statement-breakpoint
CREATE INDEX audit_log_action_occurred_idx ON public.audit_log USING btree (action, occurred_at);
--> statement-breakpoint
CREATE INDEX audit_log_actor_occurred_idx ON public.audit_log USING btree (actor_subject, occurred_at);
--> statement-breakpoint
CREATE INDEX audit_log_tenant_occurred_idx ON public.audit_log USING btree (tenant_id, occurred_at);
--> statement-breakpoint
CREATE UNIQUE INDEX customer_profiles_user_tenant_uq ON public.customer_profiles USING btree (user_id, tenant_id);
--> statement-breakpoint
CREATE INDEX inbox_processed_consumer_processed_at_idx ON public.inbox_processed USING btree (consumer, processed_at);
--> statement-breakpoint
CREATE UNIQUE INDEX locations_id_tenant_uq ON public.locations USING btree (id, tenant_id);
--> statement-breakpoint
CREATE UNIQUE INDEX member_id_tenant_uq ON public.member USING btree (id, tenant_id);
--> statement-breakpoint
CREATE INDEX member_location_scope_location_idx ON public.member_location_scope USING btree (location_id);
--> statement-breakpoint
CREATE INDEX member_location_scope_tenant_idx ON public.member_location_scope USING btree (tenant_id);
--> statement-breakpoint
CREATE UNIQUE INDEX menu_categories_id_tenant_uq ON public.menu_categories USING btree (id, tenant_id);
--> statement-breakpoint
CREATE UNIQUE INDEX menu_categories_tenant_code_uq ON public.menu_categories USING btree (tenant_id, code) WHERE (code IS NOT NULL);
--> statement-breakpoint
CREATE UNIQUE INDEX menu_categories_tenant_slug_uq ON public.menu_categories USING btree (tenant_id, slug);
--> statement-breakpoint
CREATE INDEX menu_categories_tenant_sort_idx ON public.menu_categories USING btree (tenant_id, sort_order);
--> statement-breakpoint
CREATE INDEX menu_item_modifier_groups_tenant_item_idx ON public.menu_item_modifier_groups USING btree (tenant_id, menu_item_id);
--> statement-breakpoint
CREATE UNIQUE INDEX menu_item_sizes_id_tenant_uq ON public.menu_item_sizes USING btree (id, tenant_id);
--> statement-breakpoint
CREATE UNIQUE INDEX menu_item_sizes_one_default_per_item_uq ON public.menu_item_sizes USING btree (menu_item_id) WHERE (is_default = true);
--> statement-breakpoint
CREATE INDEX menu_item_sizes_tenant_item_idx ON public.menu_item_sizes USING btree (tenant_id, menu_item_id, sort_order);
--> statement-breakpoint
CREATE UNIQUE INDEX menu_item_slug_aliases_id_tenant_uq ON public.menu_item_slug_aliases USING btree (id, tenant_id);
--> statement-breakpoint
CREATE UNIQUE INDEX menu_item_slug_aliases_tenant_alias_uq ON public.menu_item_slug_aliases USING btree (tenant_id, alias);
--> statement-breakpoint
CREATE UNIQUE INDEX menu_items_id_tenant_uq ON public.menu_items USING btree (id, tenant_id);
--> statement-breakpoint
CREATE INDEX menu_items_tenant_category_status_idx ON public.menu_items USING btree (tenant_id, category_id, status);
--> statement-breakpoint
CREATE UNIQUE INDEX menu_items_tenant_code_uq ON public.menu_items USING btree (tenant_id, code) WHERE (code IS NOT NULL);
--> statement-breakpoint
CREATE UNIQUE INDEX menu_items_tenant_slug_uq ON public.menu_items USING btree (tenant_id, slug);
--> statement-breakpoint
CREATE INDEX menu_items_tenant_status_sort_idx ON public.menu_items USING btree (tenant_id, status, sort_order);
--> statement-breakpoint
CREATE UNIQUE INDEX menu_modifier_groups_id_tenant_uq ON public.menu_modifier_groups USING btree (id, tenant_id);
--> statement-breakpoint
CREATE INDEX menu_modifier_options_tenant_group_idx ON public.menu_modifier_options USING btree (tenant_id, modifier_group_id, sort_order);
--> statement-breakpoint
CREATE UNIQUE INDEX menu_stop_list_id_tenant_uq ON public.menu_stop_list USING btree (id, tenant_id);
--> statement-breakpoint
CREATE UNIQUE INDEX menu_stop_list_location_item_tenant_uq ON public.menu_stop_list USING btree (tenant_id, location_id, item_id);
--> statement-breakpoint
CREATE UNIQUE INDEX order_items_id_tenant_uq ON public.order_items USING btree (id, tenant_id);
--> statement-breakpoint
CREATE INDEX orders_feed_idx ON public.orders USING btree (tenant_id, location_id, status, created_at DESC);
--> statement-breakpoint
CREATE UNIQUE INDEX orders_id_tenant_uq ON public.orders USING btree (id, tenant_id);
--> statement-breakpoint
CREATE UNIQUE INDEX orders_idempotency_key_uq ON public.orders USING btree (tenant_id, idempotency_key);
--> statement-breakpoint
CREATE INDEX outbox_events_tenant_occurred_idx ON public.outbox_events USING btree (tenant_id, occurred_at);
--> statement-breakpoint
CREATE INDEX outbox_events_type_occurred_idx ON public.outbox_events USING btree (type, occurred_at);
--> statement-breakpoint
CREATE INDEX outbox_events_undelivered_idx ON public.outbox_events USING btree (occurred_at) WHERE (delivered_at IS NULL);
--> statement-breakpoint
CREATE UNIQUE INDEX payment_refunds_request_id_uq ON public.payment_refunds USING btree (tenant_id, refund_request_id);
--> statement-breakpoint
CREATE UNIQUE INDEX payment_refunds_stripe_refund_id_uq ON public.payment_refunds USING btree (tenant_id, stripe_refund_id);
--> statement-breakpoint
CREATE UNIQUE INDEX payments_id_tenant_uq ON public.payments USING btree (id, tenant_id);
--> statement-breakpoint
CREATE UNIQUE INDEX payments_payment_intent_id_uq ON public.payments USING btree (tenant_id, payment_intent_id) WHERE (payment_intent_id IS NOT NULL);
--> statement-breakpoint
CREATE UNIQUE INDEX payments_provider_payment_id_uq ON public.payments USING btree (provider, provider_payment_id) WHERE (provider_payment_id IS NOT NULL);
--> statement-breakpoint
CREATE UNIQUE INDEX tenant_domains_domain_uq ON public.tenant_domains USING btree (domain);
--> statement-breakpoint
CREATE UNIQUE INDEX tenant_domains_one_primary_per_tenant_uq ON public.tenant_domains USING btree (tenant_id) WHERE (is_primary = true);
--> statement-breakpoint
CREATE INDEX tenant_domains_tenant_idx ON public.tenant_domains USING btree (tenant_id, kind);
--> statement-breakpoint
CREATE UNIQUE INDEX tenants_slug_uq ON public.tenants USING btree (slug);
--> statement-breakpoint
ALTER TABLE ONLY public.account
    ADD CONSTRAINT account_user_id_user_id_fk FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_tenant_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE ONLY public.catalog_location_stop_version
    ADD CONSTRAINT catalog_location_stop_version_location_fk FOREIGN KEY (location_id, tenant_id) REFERENCES public.locations(id, tenant_id) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE ONLY public.catalog_location_stop_version
    ADD CONSTRAINT catalog_location_stop_version_tenant_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);
--> statement-breakpoint
ALTER TABLE ONLY public.catalog_menu_version
    ADD CONSTRAINT catalog_menu_version_tenant_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);
--> statement-breakpoint
ALTER TABLE ONLY public.customer_profiles
    ADD CONSTRAINT customer_profiles_tenant_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY public.customer_profiles
    ADD CONSTRAINT customer_profiles_user_fk FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY public.invitation
    ADD CONSTRAINT invitation_inviter_id_user_id_fk FOREIGN KEY (inviter_id) REFERENCES public."user"(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY public.invitation
    ADD CONSTRAINT invitation_tenant_id_tenants_id_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_tenant_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY public.member_location_scope
    ADD CONSTRAINT member_location_scope_location_fk FOREIGN KEY (location_id, tenant_id) REFERENCES public.locations(id, tenant_id) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE ONLY public.member_location_scope
    ADD CONSTRAINT member_location_scope_member_fk FOREIGN KEY (member_id, tenant_id) REFERENCES public.member(id, tenant_id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY public.member_location_scope
    ADD CONSTRAINT member_location_scope_tenant_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY public.member
    ADD CONSTRAINT member_tenant_id_tenants_id_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY public.member
    ADD CONSTRAINT member_user_id_user_id_fk FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY public.menu_categories
    ADD CONSTRAINT menu_categories_parent_fk FOREIGN KEY (parent_id, tenant_id) REFERENCES public.menu_categories(id, tenant_id) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE ONLY public.menu_categories
    ADD CONSTRAINT menu_categories_tenant_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY public.menu_item_modifier_groups
    ADD CONSTRAINT menu_item_modifier_groups_group_fk FOREIGN KEY (modifier_group_id, tenant_id) REFERENCES public.menu_modifier_groups(id, tenant_id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY public.menu_item_modifier_groups
    ADD CONSTRAINT menu_item_modifier_groups_item_fk FOREIGN KEY (menu_item_id, tenant_id) REFERENCES public.menu_items(id, tenant_id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY public.menu_item_modifier_groups
    ADD CONSTRAINT menu_item_modifier_groups_tenant_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY public.menu_item_sizes
    ADD CONSTRAINT menu_item_sizes_item_fk FOREIGN KEY (menu_item_id, tenant_id) REFERENCES public.menu_items(id, tenant_id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY public.menu_item_sizes
    ADD CONSTRAINT menu_item_sizes_tenant_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY public.menu_item_slug_aliases
    ADD CONSTRAINT menu_item_slug_aliases_item_fk FOREIGN KEY (item_id, tenant_id) REFERENCES public.menu_items(id, tenant_id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY public.menu_item_slug_aliases
    ADD CONSTRAINT menu_item_slug_aliases_tenant_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY public.menu_items
    ADD CONSTRAINT menu_items_category_fk FOREIGN KEY (category_id, tenant_id) REFERENCES public.menu_categories(id, tenant_id) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE ONLY public.menu_items
    ADD CONSTRAINT menu_items_tenant_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY public.menu_modifier_groups
    ADD CONSTRAINT menu_modifier_groups_tenant_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY public.menu_modifier_options
    ADD CONSTRAINT menu_modifier_options_group_fk FOREIGN KEY (modifier_group_id, tenant_id) REFERENCES public.menu_modifier_groups(id, tenant_id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY public.menu_modifier_options
    ADD CONSTRAINT menu_modifier_options_tenant_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY public.menu_stop_list
    ADD CONSTRAINT menu_stop_list_item_fk FOREIGN KEY (item_id, tenant_id) REFERENCES public.menu_items(id, tenant_id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY public.menu_stop_list
    ADD CONSTRAINT menu_stop_list_location_fk FOREIGN KEY (location_id, tenant_id) REFERENCES public.locations(id, tenant_id) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE ONLY public.menu_stop_list
    ADD CONSTRAINT menu_stop_list_tenant_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY public.order_daily_sequences
    ADD CONSTRAINT order_daily_sequences_location_fk FOREIGN KEY (location_id, tenant_id) REFERENCES public.locations(id, tenant_id) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE ONLY public.order_daily_sequences
    ADD CONSTRAINT order_daily_sequences_tenant_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_order_fk FOREIGN KEY (order_id, tenant_id) REFERENCES public.orders(id, tenant_id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_tenant_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY public.order_modifiers
    ADD CONSTRAINT order_modifiers_order_item_fk FOREIGN KEY (order_item_id, tenant_id) REFERENCES public.order_items(id, tenant_id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY public.order_modifiers
    ADD CONSTRAINT order_modifiers_tenant_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_location_fk FOREIGN KEY (location_id, tenant_id) REFERENCES public.locations(id, tenant_id) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_tenant_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY public.outbox_events
    ADD CONSTRAINT outbox_events_tenant_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE ONLY public.payment_refunds
    ADD CONSTRAINT payment_refunds_payment_fk FOREIGN KEY (payment_id, tenant_id) REFERENCES public.payments(id, tenant_id) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE ONLY public.payment_refunds
    ADD CONSTRAINT payment_refunds_tenant_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_order_fk FOREIGN KEY (order_id, tenant_id) REFERENCES public.orders(id, tenant_id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_tenant_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_user_id_user_id_fk FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY public.tenant_role
    ADD CONSTRAINT tenant_role_tenant_id_tenants_id_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY public.two_factor
    ADD CONSTRAINT two_factor_user_id_user_id_fk FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY audit_log_insert_iso ON public.audit_log FOR INSERT WITH CHECK ((public.is_system_session() OR ((tenant_id IS NOT NULL) AND (tenant_id = public.current_tenant_id()))));
--> statement-breakpoint
CREATE POLICY audit_log_read_iso ON public.audit_log FOR SELECT USING ((public.is_system_session() OR ((tenant_id IS NOT NULL) AND (tenant_id = public.current_tenant_id()))));
--> statement-breakpoint
ALTER TABLE public.catalog_location_stop_version ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY catalog_location_stop_version_location_iso ON public.catalog_location_stop_version AS RESTRICTIVE USING ((public.is_system_session() OR (public.current_location_id() IS NULL) OR (location_id = public.current_location_id()))) WITH CHECK ((public.is_system_session() OR (public.current_location_id() IS NULL) OR (location_id = public.current_location_id())));
--> statement-breakpoint
CREATE POLICY catalog_location_stop_version_tenant_iso ON public.catalog_location_stop_version USING ((public.is_system_session() OR (tenant_id = public.current_tenant_id()))) WITH CHECK ((public.is_system_session() OR (tenant_id = public.current_tenant_id())));
--> statement-breakpoint
ALTER TABLE public.catalog_menu_version ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY catalog_menu_version_iso ON public.catalog_menu_version USING ((public.is_system_session() OR (tenant_id = public.current_tenant_id()))) WITH CHECK ((public.is_system_session() OR (tenant_id = public.current_tenant_id())));
--> statement-breakpoint
ALTER TABLE public.customer_profiles ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY customer_profiles_tenant_isolation ON public.customer_profiles USING ((public.is_system_session() OR (tenant_id = public.current_tenant_id()))) WITH CHECK ((public.is_system_session() OR (tenant_id = public.current_tenant_id())));
--> statement-breakpoint
ALTER TABLE public.inbox_processed ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY inbox_processed_delete_iso ON public.inbox_processed FOR DELETE USING (public.is_system_session());
--> statement-breakpoint
CREATE POLICY inbox_processed_insert_iso ON public.inbox_processed FOR INSERT WITH CHECK (public.is_system_session());
--> statement-breakpoint
CREATE POLICY inbox_processed_select_iso ON public.inbox_processed FOR SELECT USING (public.is_system_session());
--> statement-breakpoint
ALTER TABLE public.invitation ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY invitation_resto_auth_full ON public.invitation TO resto_auth USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY invitation_tenant_isolation ON public.invitation USING ((public.is_system_session() OR (tenant_id = public.current_tenant_id()))) WITH CHECK ((public.is_system_session() OR (tenant_id = public.current_tenant_id())));
--> statement-breakpoint
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY locations_iso ON public.locations USING ((public.is_system_session() OR (tenant_id = public.current_tenant_id()))) WITH CHECK ((public.is_system_session() OR (tenant_id = public.current_tenant_id())));
--> statement-breakpoint
ALTER TABLE public.member ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.member_location_scope ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY member_location_scope_iso ON public.member_location_scope USING ((public.is_system_session() OR (tenant_id = public.current_tenant_id()))) WITH CHECK ((public.is_system_session() OR (tenant_id = public.current_tenant_id())));
--> statement-breakpoint
CREATE POLICY member_resto_auth_full ON public.member TO resto_auth USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY member_tenant_isolation ON public.member USING ((public.is_system_session() OR (tenant_id = public.current_tenant_id()))) WITH CHECK ((public.is_system_session() OR (tenant_id = public.current_tenant_id())));
--> statement-breakpoint
ALTER TABLE public.menu_categories ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY menu_categories_iso ON public.menu_categories USING ((public.is_system_session() OR (tenant_id = public.current_tenant_id()))) WITH CHECK ((public.is_system_session() OR (tenant_id = public.current_tenant_id())));
--> statement-breakpoint
ALTER TABLE public.menu_item_modifier_groups ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY menu_item_modifiers_iso ON public.menu_item_modifier_groups USING ((public.is_system_session() OR (tenant_id = public.current_tenant_id()))) WITH CHECK ((public.is_system_session() OR (tenant_id = public.current_tenant_id())));
--> statement-breakpoint
ALTER TABLE public.menu_item_sizes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.menu_item_slug_aliases ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY menu_item_slug_aliases_iso ON public.menu_item_slug_aliases USING ((public.is_system_session() OR (tenant_id = public.current_tenant_id()))) WITH CHECK ((public.is_system_session() OR (tenant_id = public.current_tenant_id())));
--> statement-breakpoint
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY menu_items_iso ON public.menu_items USING ((public.is_system_session() OR (tenant_id = public.current_tenant_id()))) WITH CHECK ((public.is_system_session() OR (tenant_id = public.current_tenant_id())));
--> statement-breakpoint
ALTER TABLE public.menu_modifier_groups ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.menu_modifier_options ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY menu_modifier_options_iso ON public.menu_modifier_options USING ((public.is_system_session() OR (tenant_id = public.current_tenant_id()))) WITH CHECK ((public.is_system_session() OR (tenant_id = public.current_tenant_id())));
--> statement-breakpoint
CREATE POLICY menu_modifiers_iso ON public.menu_modifier_groups USING ((public.is_system_session() OR (tenant_id = public.current_tenant_id()))) WITH CHECK ((public.is_system_session() OR (tenant_id = public.current_tenant_id())));
--> statement-breakpoint
ALTER TABLE public.menu_stop_list ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY menu_stop_list_iso ON public.menu_stop_list USING ((public.is_system_session() OR (tenant_id = public.current_tenant_id()))) WITH CHECK ((public.is_system_session() OR (tenant_id = public.current_tenant_id())));
--> statement-breakpoint
CREATE POLICY menu_stop_list_location_iso ON public.menu_stop_list AS RESTRICTIVE USING ((public.is_system_session() OR (public.current_location_id() IS NULL) OR (location_id = public.current_location_id()))) WITH CHECK ((public.is_system_session() OR (public.current_location_id() IS NULL) OR (location_id = public.current_location_id())));
--> statement-breakpoint
CREATE POLICY menu_variants_iso ON public.menu_item_sizes USING ((public.is_system_session() OR (tenant_id = public.current_tenant_id()))) WITH CHECK ((public.is_system_session() OR (tenant_id = public.current_tenant_id())));
--> statement-breakpoint
ALTER TABLE public.order_daily_sequences ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY order_daily_sequences_iso ON public.order_daily_sequences USING ((public.is_system_session() OR (tenant_id = public.current_tenant_id()))) WITH CHECK ((public.is_system_session() OR (tenant_id = public.current_tenant_id())));
--> statement-breakpoint
CREATE POLICY order_daily_sequences_location_iso ON public.order_daily_sequences AS RESTRICTIVE USING ((public.is_system_session() OR (public.current_location_id() IS NULL) OR (location_id = public.current_location_id()))) WITH CHECK ((public.is_system_session() OR (public.current_location_id() IS NULL) OR (location_id = public.current_location_id())));
--> statement-breakpoint
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY order_items_iso ON public.order_items USING ((public.is_system_session() OR (tenant_id = public.current_tenant_id()))) WITH CHECK ((public.is_system_session() OR (tenant_id = public.current_tenant_id())));
--> statement-breakpoint
ALTER TABLE public.order_modifiers ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY order_modifiers_iso ON public.order_modifiers USING ((public.is_system_session() OR (tenant_id = public.current_tenant_id()))) WITH CHECK ((public.is_system_session() OR (tenant_id = public.current_tenant_id())));
--> statement-breakpoint
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY orders_iso ON public.orders USING ((public.is_system_session() OR (tenant_id = public.current_tenant_id()))) WITH CHECK ((public.is_system_session() OR (tenant_id = public.current_tenant_id())));
--> statement-breakpoint
CREATE POLICY orders_location_iso ON public.orders AS RESTRICTIVE USING ((public.is_system_session() OR (public.current_location_id() IS NULL) OR (location_id = public.current_location_id()))) WITH CHECK ((public.is_system_session() OR (public.current_location_id() IS NULL) OR (location_id = public.current_location_id())));
--> statement-breakpoint
ALTER TABLE public.outbox_events ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY outbox_events_insert_iso ON public.outbox_events FOR INSERT WITH CHECK ((public.is_system_session() OR ((tenant_id IS NOT NULL) AND (tenant_id = public.current_tenant_id()))));
--> statement-breakpoint
CREATE POLICY outbox_events_read_iso ON public.outbox_events FOR SELECT USING (public.is_system_session());
--> statement-breakpoint
CREATE POLICY outbox_events_update_iso ON public.outbox_events FOR UPDATE USING (public.is_system_session()) WITH CHECK (public.is_system_session());
--> statement-breakpoint
ALTER TABLE public.payment_refunds ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY payment_refunds_iso ON public.payment_refunds USING ((public.is_system_session() OR (tenant_id = public.current_tenant_id()))) WITH CHECK ((public.is_system_session() OR (tenant_id = public.current_tenant_id())));
--> statement-breakpoint
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY payments_iso ON public.payments USING ((public.is_system_session() OR (tenant_id = public.current_tenant_id()))) WITH CHECK ((public.is_system_session() OR (tenant_id = public.current_tenant_id())));
--> statement-breakpoint
ALTER TABLE public.tenant_domains ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_domains_iso ON public.tenant_domains USING ((public.is_system_session() OR (tenant_id = public.current_tenant_id()))) WITH CHECK ((public.is_system_session() OR (tenant_id = public.current_tenant_id())));
--> statement-breakpoint
ALTER TABLE public.tenant_role ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_role_resto_auth_full ON public.tenant_role TO resto_auth USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY tenant_role_tenant_isolation ON public.tenant_role USING ((public.is_system_session() OR (tenant_id = public.current_tenant_id()))) WITH CHECK ((public.is_system_session() OR (tenant_id = public.current_tenant_id())));
--> statement-breakpoint
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenants_resto_auth_full ON public.tenants TO resto_auth USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY tenants_self_iso ON public.tenants USING ((public.is_system_session() OR (id = public.current_tenant_id())));
--> statement-breakpoint
-- pg_dump does not emit REVOKEs against default PUBLIC privileges, so these must be written by
-- hand and re-checked whenever this baseline is regenerated. Without them every SECURITY DEFINER
-- helper below — tenant-GUC binding and tenant erasure included — is callable by PUBLIC.
REVOKE EXECUTE ON FUNCTION pg_catalog.set_config(text, text, boolean) FROM PUBLIC;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION public.app_bind_tenant(text, boolean) FROM PUBLIC;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION public.app_bind_location(text) FROM PUBLIC;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION public.app_allow_erasure(uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION public.tenancy_erase_tenant(uuid, text, text) FROM PUBLIC;
