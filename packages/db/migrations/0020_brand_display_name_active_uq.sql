-- 0020_brand_display_name_active_uq.sql
-- RES-182: prevent two active brands inside the same tenant from sharing
-- the same `display_name` (case-insensitive). Slug uniqueness is already
-- enforced; the operator-visible label needs the same guarantee so a
-- double-click or copy-paste mistake does not create duplicate "Burger"
-- entries in the admin UI.
--
-- Active-only (`status != 'erased'`) so an erased name becomes available
-- again — same shape as `brands_slug_active_uq`.

-- 1. Resolve any existing case-insensitive duplicates inside a tenant by
-- suffixing all but the earliest row. Idempotent on a clean DB.
WITH ranked AS (
  SELECT
    id,
    display_name,
    row_number() OVER (
      PARTITION BY tenant_id, lower(display_name)
      ORDER BY created_at, id
    ) AS rn
  FROM brands
  WHERE status != 'erased'
)
UPDATE brands AS b
SET display_name = ranked.display_name || ' (' || ranked.rn::text || ')',
    updated_at   = now()
FROM ranked
WHERE b.id = ranked.id
  AND ranked.rn > 1;
--> statement-breakpoint

-- 2. Enforce going forward.
CREATE UNIQUE INDEX IF NOT EXISTS brands_tenant_display_name_active_uq
  ON brands (tenant_id, lower(display_name))
  WHERE status != 'erased';
