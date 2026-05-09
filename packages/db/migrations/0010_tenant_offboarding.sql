-- 0010_tenant_offboarding.sql
-- RES-138 / RES-103 phase 1: schema additions for GDPR tenant offboarding.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE tenants
  ADD COLUMN offboarding_scheduled_at  timestamp with time zone,
  ADD COLUMN offboarding_executed_at   timestamp with time zone,
  ADD COLUMN offboarding_requested_by  text;

ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_status_chk;
ALTER TABLE tenants
  ADD CONSTRAINT tenants_status_chk
  CHECK (status IN ('active', 'suspended', 'archived', 'pending_offboarding', 'erased'));
