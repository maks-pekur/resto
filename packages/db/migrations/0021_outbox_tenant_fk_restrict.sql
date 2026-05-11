-- 0021_outbox_tenant_fk_restrict.sql
-- RES-186: switch outbox_events.tenant_id FK from ON DELETE SET NULL to
-- ON DELETE RESTRICT. Tenancy erasure already deletes outbox rows for
-- the tenant before any DELETE on `tenants` (see
-- 0011_tenancy_erase_function.sql / 0019_erase_includes_brands.sql), so
-- the constraint never fires under the documented flow. RESTRICT makes
-- any future hard-delete of a tenant fail loudly instead of silently
-- re-tagging pending events as platform-level (tenant_id = NULL).

ALTER TABLE outbox_events
  DROP CONSTRAINT outbox_events_tenant_fk;
--> statement-breakpoint
ALTER TABLE outbox_events
  ADD CONSTRAINT outbox_events_tenant_fk
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
