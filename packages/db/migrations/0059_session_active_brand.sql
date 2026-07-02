-- 0059_session_active_brand.sql
-- D-09 (08.2-03): server-side active-brand pin stored in the session row.
-- Soft FK by comment only — BA does not enforce FK on additionalFields columns.
-- input:false in auth.config.ts ensures clients cannot forge this via /update-session.
ALTER TABLE "session" ADD COLUMN IF NOT EXISTS "active_brand_id" text;
