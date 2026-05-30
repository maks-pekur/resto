-- Phase 4a-03 step L: RLS ENABLE + FORCE + iso policies for new tables.
-- ADR-0020: every tenant-scoped table has RLS enabled + FORCED. Pitfall 4 in RESEARCH.md
-- (Drizzle-kit does not emit RLS DDL, it has to be added by hand).

ALTER TABLE "menu_stop_list" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "menu_stop_list" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "menu_stop_list_iso" ON "menu_stop_list"
  USING (is_system_session() OR tenant_id = current_tenant_id())
  WITH CHECK (is_system_session() OR tenant_id = current_tenant_id());
--> statement-breakpoint

ALTER TABLE "menu_item_slug_aliases" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "menu_item_slug_aliases" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "menu_item_slug_aliases_iso" ON "menu_item_slug_aliases"
  USING (is_system_session() OR tenant_id = current_tenant_id())
  WITH CHECK (is_system_session() OR tenant_id = current_tenant_id());
--> statement-breakpoint
