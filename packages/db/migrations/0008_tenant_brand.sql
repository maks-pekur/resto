-- The guest-facing identity of the restaurant: what it says about itself, how it is reached and
-- where it is found. `description` is localized text, same shape as menu names.
ALTER TABLE tenants ADD COLUMN description jsonb;
ALTER TABLE tenants ADD COLUMN socials jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE tenants ADD COLUMN contact_phone text;
ALTER TABLE tenants ADD COLUMN contact_email text;
ALTER TABLE tenants ADD COLUMN contact_website text;

ALTER TABLE tenants ADD CONSTRAINT tenants_socials_object_chk CHECK (jsonb_typeof(socials) = 'object');
ALTER TABLE tenants ADD CONSTRAINT tenants_description_object_chk CHECK (
  description IS NULL OR jsonb_typeof(description) = 'object'
);
