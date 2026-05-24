-- RES-236 Phase 3a: composite tenant FK for brand_domains → brands.
-- ADR-0020 I-2: child carries (parent_id, tenant_id) composite FK so
-- a tenant_id mismatch on join paths is structurally impossible.

ALTER TABLE brands
  ADD CONSTRAINT brands_id_tenant_uq UNIQUE (id, tenant_id);
--> statement-breakpoint

ALTER TABLE brand_domains
  DROP CONSTRAINT brand_domains_brand_fk;
--> statement-breakpoint

ALTER TABLE brand_domains
  ADD CONSTRAINT brand_domains_brand_fk
  FOREIGN KEY (brand_id, tenant_id)
  REFERENCES brands (id, tenant_id)
  ON DELETE CASCADE;
