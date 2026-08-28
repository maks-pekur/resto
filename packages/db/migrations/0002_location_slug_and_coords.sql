-- Locations gain a URL slug and an exact point; tenants gain the timezone locations inherit.
--
-- Written by hand rather than generated: the 0000 baseline came from pg_dump, so drizzle has no
-- snapshot to diff against and `db:generate` emits the whole schema instead of the delta.
--
-- Order matters. `slug` is NOT NULL, so existing rows are backfilled from their names before the
-- constraint lands. Coordinates stay nullable here — every existing row is a demo fixture with no
-- address at all, and inventing coordinates in a migration would be worse than admitting they are
-- missing. `seed-demo` sets real ones; the API requires them on create.

ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'UTC';
--> statement-breakpoint
-- Existing tenants already declare a country, so leaving them on UTC would be a worse guess than
-- the one the registry makes for a new tenant in the same place. Mirrors COUNTRY_REGISTRY.
UPDATE public.tenants SET timezone = CASE country
  WHEN 'UA' THEN 'Europe/Kyiv'
  WHEN 'GB' THEN 'Europe/London'
  WHEN 'ES' THEN 'Europe/Madrid'
  ELSE timezone
END WHERE timezone = 'UTC';
--> statement-breakpoint
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS slug text;
--> statement-breakpoint
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS latitude numeric(9, 6);
--> statement-breakpoint
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS longitude numeric(9, 6);
--> statement-breakpoint

-- Backfill: lowercase, non-alphanumerics to hyphens, trimmed. Existing names are ASCII, so the
-- Cyrillic transliteration the application does is not needed here. A collision inside one tenant
-- gets a numeric suffix so the unique index below can be created.
UPDATE public.locations l
SET slug = base.candidate || CASE WHEN base.rn = 1 THEN '' ELSE '-' || base.rn::text END
FROM (
  SELECT
    id,
    tenant_id,
    NULLIF(trim(both '-' from regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g')), '') AS candidate,
    row_number() OVER (
      PARTITION BY tenant_id, NULLIF(trim(both '-' from regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g')), '')
      ORDER BY created_at, id
    ) AS rn
  FROM public.locations
) AS base
WHERE l.id = base.id AND l.slug IS NULL;
--> statement-breakpoint

-- Anything the regex could not salvage (a name with no ASCII alphanumerics at all) falls back to
-- the row id, which is ugly but unique and editable — better than blocking the migration.
UPDATE public.locations SET slug = 'location-' || left(id::text, 8) WHERE slug IS NULL OR slug = '';
--> statement-breakpoint

ALTER TABLE public.locations ALTER COLUMN slug SET NOT NULL;
--> statement-breakpoint
ALTER TABLE public.locations
  ADD CONSTRAINT locations_slug_format_chk CHECK (slug ~ '^[a-z0-9][a-z0-9-]*$');
--> statement-breakpoint
ALTER TABLE public.locations
  ADD CONSTRAINT locations_coords_range_chk CHECK (
    (latitude IS NULL OR latitude BETWEEN -90 AND 90)
    AND (longitude IS NULL OR longitude BETWEEN -180 AND 180)
  );
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS locations_tenant_slug_uq ON public.locations (tenant_id, slug);
