-- 0079_organization_merge.sql
-- D-01/D-04/D-07..D-12/D-23/D-41 (phase 10.2 plan 05): merge brands into
-- tenants, tear down brand RLS, and rename Better Auth's organization-named
-- tables/columns to tenant names. Shipped as a schema rewrite with a
-- dev-database reset (D-12) — no data-preserving path is required, but the
-- domain-row merge (step 5) and this migration's structure stay correct if
-- ever replayed against a populated database.
--
-- CONTEXT.md D-09 cites 9 brand policies across 3 migrations. The live,
-- verified count is DIFFERENT ON BOTH SIDES of that citation:
--   - Two of the stop-list-related policies were already dropped in
--     migration 0068 (Phase 08.4 stop-list re-grain) — RESEARCH.md
--     Pitfall 1 already caught this half (see that migration's own header).
--   - `locations_brand_iso` (migration 0063) was NOT in either citation
--     and is still live — locations is a directly brand_id NOT NULL table,
--     RESTRICTIVE-policied the same way menu_categories/orders are. This
--     migration drops locations.brand_id, so the policy must go first.
-- Net verified count: 8 policies + 2 functions, not 9 and not the 7 this
-- plan's own action list enumerated before this file was written.

-- ── 1. RLS teardown ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS menu_categories_brand_iso ON menu_categories;
--> statement-breakpoint
DROP POLICY IF EXISTS menu_items_brand_iso ON menu_items;
--> statement-breakpoint
DROP POLICY IF EXISTS menu_item_sizes_brand_iso ON menu_item_sizes;
--> statement-breakpoint
DROP POLICY IF EXISTS menu_modifier_groups_brand_iso ON menu_modifier_groups;
--> statement-breakpoint
DROP POLICY IF EXISTS menu_modifier_options_brand_iso ON menu_modifier_options;
--> statement-breakpoint
DROP POLICY IF EXISTS menu_item_modifier_groups_brand_iso ON menu_item_modifier_groups;
--> statement-breakpoint
DROP POLICY IF EXISTS orders_brand_iso ON orders;
--> statement-breakpoint
DROP POLICY IF EXISTS locations_brand_iso ON locations;
--> statement-breakpoint

-- ── 2. Brand GUC functions ──────────────────────────────────────────────
DROP FUNCTION IF EXISTS current_brand_id();
--> statement-breakpoint
DROP FUNCTION IF EXISTS app_bind_brand(text);
--> statement-breakpoint

-- ── 3. Column drops — brand_id in 10 places (D-08's 9 + locations, the
--       tenth column plan 03 already removed from the Drizzle schema) ────
ALTER TABLE menu_categories DROP CONSTRAINT IF EXISTS menu_categories_brand_fk;
--> statement-breakpoint
DROP INDEX IF EXISTS menu_categories_brand_slug_uq;
--> statement-breakpoint
DROP INDEX IF EXISTS menu_categories_brand_code_uq;
--> statement-breakpoint
ALTER TABLE menu_categories DROP COLUMN IF EXISTS brand_id;
--> statement-breakpoint

ALTER TABLE menu_items DROP CONSTRAINT IF EXISTS menu_items_brand_fk;
--> statement-breakpoint
DROP INDEX IF EXISTS menu_items_brand_slug_uq;
--> statement-breakpoint
DROP INDEX IF EXISTS menu_items_brand_code_uq;
--> statement-breakpoint
ALTER TABLE menu_items DROP COLUMN IF EXISTS brand_id;
--> statement-breakpoint

ALTER TABLE menu_item_sizes DROP CONSTRAINT IF EXISTS menu_item_sizes_brand_fk;
--> statement-breakpoint
ALTER TABLE menu_item_sizes DROP COLUMN IF EXISTS brand_id;
--> statement-breakpoint

ALTER TABLE menu_modifier_groups DROP CONSTRAINT IF EXISTS menu_modifier_groups_brand_fk;
--> statement-breakpoint
ALTER TABLE menu_modifier_groups DROP COLUMN IF EXISTS brand_id;
--> statement-breakpoint

ALTER TABLE menu_modifier_options DROP CONSTRAINT IF EXISTS menu_modifier_options_brand_fk;
--> statement-breakpoint
ALTER TABLE menu_modifier_options DROP COLUMN IF EXISTS brand_id;
--> statement-breakpoint

ALTER TABLE menu_item_modifier_groups DROP CONSTRAINT IF EXISTS menu_item_modifier_groups_brand_fk;
--> statement-breakpoint
ALTER TABLE menu_item_modifier_groups DROP COLUMN IF EXISTS brand_id;
--> statement-breakpoint

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_brand_fk;
--> statement-breakpoint
ALTER TABLE orders DROP COLUMN IF EXISTS brand_id;
--> statement-breakpoint

ALTER TABLE customer_profiles DROP COLUMN IF EXISTS brand_id;
--> statement-breakpoint

ALTER TABLE outbox_events DROP COLUMN IF EXISTS brand_id;
--> statement-breakpoint

ALTER TABLE locations DROP CONSTRAINT IF EXISTS locations_brand_fk;
--> statement-breakpoint
ALTER TABLE locations DROP COLUMN IF EXISTS brand_id;
--> statement-breakpoint

-- ── 4. Recreate the four collapsed unique indexes on tenant-only keys ──
CREATE UNIQUE INDEX menu_categories_tenant_slug_uq ON menu_categories (tenant_id, slug);
--> statement-breakpoint
CREATE UNIQUE INDEX menu_categories_tenant_code_uq ON menu_categories (tenant_id, code) WHERE code IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX menu_items_tenant_slug_uq ON menu_items (tenant_id, slug);
--> statement-breakpoint
CREATE UNIQUE INDEX menu_items_tenant_code_uq ON menu_items (tenant_id, code) WHERE code IS NOT NULL;
--> statement-breakpoint

-- ── 5. Domain merge (D-23) — brand_domains rows fold into tenant_domains,
--       then the table is dropped. Kept even though D-12 resets the dev DB,
--       so this migration stays honest if ever replayed against real data. ─
INSERT INTO tenant_domains (id, tenant_id, domain, kind, is_primary, verified_at, created_at, updated_at, archived_at)
SELECT gen_random_uuid(), tenant_id, domain, kind, is_primary, verified_at, created_at, updated_at, archived_at
FROM brand_domains
ON CONFLICT (domain) DO NOTHING;
--> statement-breakpoint
DROP TABLE IF EXISTS brand_domains;
--> statement-breakpoint

-- ── 6. tenants gains every brand column plus country (D-34) ────────────
ALTER TABLE tenants ADD COLUMN theme jsonb;
--> statement-breakpoint
ALTER TABLE tenants ADD COLUMN legal_name text;
--> statement-breakpoint
ALTER TABLE tenants ADD COLUMN legal_form text;
--> statement-breakpoint
ALTER TABLE tenants ADD COLUMN tax_id text;
--> statement-breakpoint
ALTER TABLE tenants ADD COLUMN stripe_account_id text;
--> statement-breakpoint
ALTER TABLE tenants ADD COLUMN payment_provider text NOT NULL DEFAULT 'stripe';
--> statement-breakpoint
ALTER TABLE tenants ADD COLUMN account_type text;
--> statement-breakpoint
ALTER TABLE tenants ADD COLUMN stripe_charges_enabled boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE tenants ADD COLUMN stripe_payouts_enabled boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE tenants ADD COLUMN stripe_onboarding_status text NOT NULL DEFAULT 'not_started';
--> statement-breakpoint
ALTER TABLE tenants ADD COLUMN stripe_requirements_due jsonb;
--> statement-breakpoint
ALTER TABLE tenants ADD COLUMN fiscalization_config jsonb;
--> statement-breakpoint

-- country: nullable first, backfill, then NOT NULL — a bare
-- `ADD COLUMN ... NOT NULL` with no default fails on a non-empty table.
-- Backfill choice: 'GB' (D-33's unambiguous English-market entry) — no
-- country config exists yet to derive a better default from; any existing
-- row under D-12's dev reset is fixture data, not a real tenant.
ALTER TABLE tenants ADD COLUMN country text;
--> statement-breakpoint
UPDATE tenants SET country = 'GB' WHERE country IS NULL;
--> statement-breakpoint
ALTER TABLE tenants ALTER COLUMN country SET NOT NULL;
--> statement-breakpoint

ALTER TABLE tenants ADD CONSTRAINT tenants_legal_form_chk
  CHECK (legal_form IS NULL OR legal_form IN ('IP','OOO','LLC','SOLE_PROP','OTHER'));
--> statement-breakpoint
ALTER TABLE tenants ADD CONSTRAINT tenants_payment_provider_chk
  CHECK (payment_provider IN ('stripe'));
--> statement-breakpoint
ALTER TABLE tenants ADD CONSTRAINT tenants_account_type_chk
  CHECK (account_type IS NULL OR account_type IN ('express', 'standard'));
--> statement-breakpoint
ALTER TABLE tenants ADD CONSTRAINT tenants_stripe_onboarding_status_chk
  CHECK (stripe_onboarding_status IN ('not_started', 'pending', 'complete', 'restricted'));
--> statement-breakpoint
ALTER TABLE tenants ADD CONSTRAINT tenants_country_chk
  CHECK (country IN ('UA', 'GB', 'ES'));
--> statement-breakpoint

-- REPLACE tenants_status_chk so it also admits 'pending_setup' (D-31's
-- flag-free onboarding resume derives from this value). Postgres will not
-- widen a CHECK in place — drop by name, then add the new one.
ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_status_chk;
--> statement-breakpoint
ALTER TABLE tenants ADD CONSTRAINT tenants_status_chk
  CHECK (status IN ('pending_setup', 'active', 'suspended', 'archived', 'pending_offboarding', 'erased'));
--> statement-breakpoint

-- ── 7. Drop the brand tables — children first ───────────────────────────
DROP TABLE IF EXISTS member_brand_scope;
--> statement-breakpoint
DROP TABLE IF EXISTS brands;
--> statement-breakpoint

-- ── 8. Session: drop the retired brand pin ──────────────────────────────
ALTER TABLE session DROP COLUMN IF EXISTS active_brand_id;
--> statement-breakpoint

-- ── 9. packages/db/sql/roles.sql grant audit ────────────────────────────
-- roles.sql grants via `GRANT ... ON ALL TABLES IN SCHEMA public` (no
-- per-table names) — verified zero grants naming brands, brand_domains or
-- member_brand_scope specifically. Nothing to edit there.

-- ── 10. D-41 — rename Better Auth's organization-named tables/columns to
--        tenant names. `organization` (the BA plugin import, the type
--        names, the HTTP route vocabulary) is NOT touched — it is BA's own
--        API surface, confined to apps/api's better-auth/ adapter. Only OUR
--        physical table/column names change. ───────────────────────────
ALTER TABLE organization_role RENAME TO tenant_role;
--> statement-breakpoint
ALTER TABLE tenant_role RENAME COLUMN organization_id TO tenant_id;
--> statement-breakpoint
ALTER TABLE tenant_role RENAME CONSTRAINT organization_role_organization_id_tenants_id_fk TO tenant_role_tenant_id_tenants_id_fk;
--> statement-breakpoint

ALTER TABLE member RENAME COLUMN organization_id TO tenant_id;
--> statement-breakpoint
ALTER TABLE member RENAME CONSTRAINT member_organization_id_tenants_id_fk TO member_tenant_id_tenants_id_fk;
--> statement-breakpoint

ALTER TABLE invitation RENAME COLUMN organization_id TO tenant_id;
--> statement-breakpoint
ALTER TABLE invitation RENAME CONSTRAINT invitation_organization_id_tenants_id_fk TO invitation_tenant_id_tenants_id_fk;
--> statement-breakpoint

ALTER TABLE session RENAME COLUMN active_organization_id TO active_tenant_id;
--> statement-breakpoint

-- ── 11. [Rule 3 — blocking, found while writing step 10] tenancy_erase_tenant
--        re-parses its DELETE statements from source text on every call — a
--        column/table rename does NOT auto-update a PL/pgSQL function body
--        the way it updates a view, index or RLS policy (those bind by
--        attribute number; a function body is opaque source text). The live
--        definition (0077) references organization_id on member/invitation/
--        organization_role, and DELETEs from member_brand_scope/
--        brand_domains/brands — all renamed or dropped above. Left
--        unfixed, the GDPR erasure pipeline (CLAUDE.md: mandatory, 30-day
--        cool-off) would throw "relation/column does not exist" on the
--        very next tenant erasure. Signature is unchanged from 0077, so no
--        DROP FUNCTION is needed before this CREATE OR REPLACE. ─────────
CREATE OR REPLACE FUNCTION tenancy_erase_tenant(
  p_tenant_id uuid,
  p_audit_salt text,
  p_actor_subject text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $func$
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
$func$;
