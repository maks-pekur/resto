---
title: A dish can only be in one category, and the operator wants several
date: 2026-08-30
priority: medium
status: pending
---

# `menu_items.category_id` is a single, NOT NULL column

The founder asked for a multi-select on the item editor: a dish should be able to sit in
more than one category ("Пицца" and "Хиты", say). Postponed on 2026-08-30 — recorded here
with the analysis so the same questions do not have to be re-derived.

## What it actually costs

The column is `menu_items.category_id`, NOT NULL, with a composite FK to `menu_categories`
and an index `menu_items_tenant_category_status_idx`. Several categories means a join
table. The project already has the exact pattern to copy: `menu_item_modifier_groups`
(tenant column, composite PK, composite tenant FKs, `sort_order`).

Touched surfaces: schema + migration + RLS, the catalog read paths (list, detail,
published menu), the upsert write path, the published-menu tree the guest app renders,
and the admin editor.

## The three questions that decide the design

**1. Does a guest see the dish in every one of its categories?** The published menu is a
tree of categories with items inside. If a dish is in two, it appears twice — which is
usually the point ("Хиты", "Новинки", "Веганское" are storefronts), but it changes the
published-menu shape, its caching, and means `apps/qr-menu` must tolerate the same item id
appearing in two places. The alternative is that extra categories are *labels* that do not
affect the tree at all.

**2. Is there a primary category?** The item list renders a "Parent → Category" path, and
an item's public URL and breadcrumbs derive from its category. With N categories, one of
them has to win — either an explicit "primary" flag or "first by sort order".

**3. iiko.** ROADMAP schedules an iiko adapter in MVP-3, and the project's convention is to
borrow iiko's entity shapes so the integration is not a rewrite. **iiko's nomenclature is
hierarchical — a product has one parent group.** Multiple equal categories diverge from
that model, and the adapter will have to pick one anyway. Not a blocker, but decide it
knowingly rather than discovering it in MVP-3.

## The cheap shape, if it is picked up as-is

Keep `category_id` as the primary category and add `menu_item_categories` for the extra
ones. The menu tree, item URLs and breadcrumbs are then unchanged; the migration is
non-breaking because every existing dish simply has no extra rows. The editor's
multi-select shows the primary plus the extras.

The equal-categories variant is strictly more work and reaches into the guest app.
