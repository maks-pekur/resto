-- 0066_session_active_location.sql
-- Phase 08.4 (D-11): server-side active-location pin stored in the session row.
-- Soft FK by comment only — BA does not enforce FK on additionalFields columns.
-- input:false in auth.config.ts (later plan) ensures clients cannot forge this
-- via /update-session.
ALTER TABLE "session" ADD COLUMN IF NOT EXISTS "active_location_id" text;
