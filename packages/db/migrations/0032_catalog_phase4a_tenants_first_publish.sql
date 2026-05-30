-- Phase 4a-02 step J: add menu_first_published_at to tenants for first-publish detection.
-- D-4a-06 (distinct first-publish vs republish event types). Plan 06 wires the detection.

ALTER TABLE tenants ADD COLUMN menu_first_published_at timestamptz;
--> statement-breakpoint
