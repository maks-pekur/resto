-- 0081_member_location_scope_composite_fk.sql
-- 10.2 plan 19: migration 0079 (D-41) renamed member.organization_id to
-- member.tenant_id. That rename made `member` newly match `db:audit-fks`'s
-- "tenant-scoped table" definition (any table with a NOT NULL tenant_id
-- column), which surfaced a pre-existing ADR-0020 I-2 gap:
-- `member_location_scope_member_fk` was always a single-column FK to
-- member(id) even though member_location_scope carries tenant_id — it was
-- just invisible to the audit before member had a tenant_id column of its
-- own to match against. Composite-ize it the same way
-- member_location_scope_location_fk already is.

CREATE UNIQUE INDEX "member_id_tenant_uq" ON "member" USING btree ("id","tenant_id");
--> statement-breakpoint
ALTER TABLE "member_location_scope" DROP CONSTRAINT "member_location_scope_member_fk";
--> statement-breakpoint
ALTER TABLE "member_location_scope" ADD CONSTRAINT "member_location_scope_member_fk" FOREIGN KEY ("member_id","tenant_id") REFERENCES "public"."member"("id","tenant_id") ON DELETE cascade ON UPDATE no action;
