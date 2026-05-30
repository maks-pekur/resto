-- Phase 4a-02 step K: create menu_versions_seq for Redis-fallback path.
-- D-4a-07 + CAT-10. MenuVersionPort.bump() falls back to nextval('menu_versions_seq') when Redis is unavailable.

CREATE SEQUENCE IF NOT EXISTS menu_versions_seq START WITH 1 INCREMENT BY 1 NO CYCLE;
--> statement-breakpoint
