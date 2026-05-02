-- Extensions used across the platform.
-- pgcrypto: gen_random_uuid() for UUID v4 ids.
-- citext: case-insensitive text (emails, slugs).
-- pg_trgm: trigram search for menu item names, free-text filters.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
