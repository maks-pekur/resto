-- Which languages this restaurant publishes its menu in. The default locale is already on the
-- tenant; this is the set it belongs to, and every guest surface reads its switcher from it.
ALTER TABLE tenants ADD COLUMN content_locales text[] NOT NULL DEFAULT ARRAY['en']::text[];

UPDATE tenants SET content_locales = ARRAY[locale]::text[];

ALTER TABLE tenants ADD CONSTRAINT tenants_content_locales_chk CHECK (
  array_length(content_locales, 1) >= 1
  AND locale = ANY (content_locales)
  AND content_locales <@ ARRAY['ru', 'en', 'uk', 'es']::text[]
);
