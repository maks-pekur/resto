-- =============================================================================
-- Phase 4a-07 step M: update `tenancy_erase_tenant` for the post-rename catalog
-- schema. D-04a-deferred-01.
--
-- Migrations 0037–0038 renamed:
--   menu_variants       → menu_item_sizes
--   menu_modifiers      → menu_modifier_groups
--   menu_item_modifiers → menu_item_modifier_groups
-- The function body in 0026 still issues DELETE FROM menu_modifiers /
-- menu_variants, which no longer exist. Calling erasure now fails with
-- `relation "menu_modifiers" does not exist`, regressing two integration
-- specs (erase-includes-brands.spec.ts, tenancy-erase-guard.spec.ts).
--
-- Plans 04A-03 also added two new GDPR-relevant tables:
--   menu_stop_list           — operator stop-list with reason/audit columns
--   menu_item_slug_aliases   — historical slug → item map for SEO
-- Both have ON DELETE CASCADE composite FKs back to menu_items, so cascade
-- WOULD handle them implicitly. Explicit DELETEs are kept for clarity and so
-- the function body remains an exhaustive audit of every tenant-scoped table
-- the erasure touches.
-- =============================================================================

DROP FUNCTION IF EXISTS tenancy_erase_tenant(uuid, text, text);
--> statement-breakpoint

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
  WHERE organization_id = p_tenant_id;

  DELETE FROM outbox_events WHERE tenant_id = p_tenant_id;
  DELETE FROM inbox_processed WHERE tenant_id = p_tenant_id;

  -- Phase 4a-07: explicit deletes for renamed + new catalog tables. Order
  -- matters where composite FKs lack ON DELETE CASCADE (none here — all the
  -- listed children cascade — but the explicit list documents the audit
  -- surface for GDPR review).
  DELETE FROM menu_stop_list WHERE tenant_id = p_tenant_id;
  DELETE FROM menu_item_slug_aliases WHERE tenant_id = p_tenant_id;
  DELETE FROM menu_item_modifier_groups WHERE tenant_id = p_tenant_id;
  DELETE FROM menu_modifier_options WHERE tenant_id = p_tenant_id;
  DELETE FROM menu_modifier_groups WHERE tenant_id = p_tenant_id;
  DELETE FROM menu_item_sizes WHERE tenant_id = p_tenant_id;
  DELETE FROM menu_items WHERE tenant_id = p_tenant_id;
  DELETE FROM menu_categories WHERE tenant_id = p_tenant_id;

  DELETE FROM customer_profiles WHERE tenant_id = p_tenant_id;
  DELETE FROM invitation WHERE organization_id = p_tenant_id;
  DELETE FROM organization_role WHERE organization_id = p_tenant_id;
  DELETE FROM member WHERE organization_id = p_tenant_id;
  DELETE FROM tenant_domains WHERE tenant_id = p_tenant_id;

  DELETE FROM member_brand_scope WHERE tenant_id = p_tenant_id;
  DELETE FROM brand_domains WHERE tenant_id = p_tenant_id;
  DELETE FROM brands WHERE tenant_id = p_tenant_id;

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
--> statement-breakpoint

REVOKE EXECUTE ON FUNCTION tenancy_erase_tenant(uuid, text, text) FROM PUBLIC;
--> statement-breakpoint

DO $grant$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'resto_app') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION tenancy_erase_tenant(uuid, text, text) TO resto_app';
  END IF;
END
$grant$;
