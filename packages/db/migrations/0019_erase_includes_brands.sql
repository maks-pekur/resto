-- 0019_erase_includes_brands.sql
-- RES-149: extend tenancy_erase_tenant to wipe brands, brand_domains,
-- and member_brand_scope. Body cloned verbatim from 0011 with three
-- additional DELETE statements after tenant_domains.

CREATE OR REPLACE FUNCTION tenancy_erase_tenant(
  p_tenant_id uuid,
  p_audit_salt text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $func$
DECLARE
  orphan_users text[];
BEGIN
  IF coalesce(nullif(current_setting('app.is_system', true), ''), 'false')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'tenancy_erase_tenant requires system context (app.is_system=true)';
  END IF;

  IF p_audit_salt IS NULL OR length(p_audit_salt) < 32 THEN
    RAISE EXCEPTION 'tenancy_erase_tenant requires p_audit_salt of >= 32 chars';
  END IF;

  SELECT array_agg(user_id) INTO orphan_users
  FROM member
  WHERE organization_id = p_tenant_id;

  DELETE FROM outbox_events WHERE tenant_id = p_tenant_id;
  DELETE FROM inbox_processed WHERE tenant_id = p_tenant_id;
  DELETE FROM menu_items WHERE tenant_id = p_tenant_id;
  DELETE FROM menu_modifiers WHERE tenant_id = p_tenant_id;
  DELETE FROM menu_categories WHERE tenant_id = p_tenant_id;
  DELETE FROM customer_profiles WHERE tenant_id = p_tenant_id;
  DELETE FROM invitation WHERE organization_id = p_tenant_id;
  DELETE FROM organization_role WHERE organization_id = p_tenant_id;
  DELETE FROM member WHERE organization_id = p_tenant_id;
  DELETE FROM tenant_domains WHERE tenant_id = p_tenant_id;

  -- RES-149 additions:
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

REVOKE EXECUTE ON FUNCTION tenancy_erase_tenant(uuid, text) FROM PUBLIC;

DO $grant$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'resto_app') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION tenancy_erase_tenant(uuid, text) TO resto_app';
  END IF;
END
$grant$;
