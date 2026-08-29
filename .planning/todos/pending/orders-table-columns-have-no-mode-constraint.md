---
title: Nothing stops a delivery or pickup order from carrying a table
date: 2026-08-29
priority: low
status: pending
---

# `orders` has no CHECK tying the table snapshot to `fulfillment_mode`

Phase 10.3 (migration `0003_table_zones_and_tables.sql`) added `table_id`,
`table_zone_name` and `table_number` to `orders`, all nullable, plus the composite
`orders_table_fk`. It did not add a constraint relating them to `fulfillment_mode`.

So the database will currently accept a row with `fulfillment_mode = 'delivery'` and a
populated `table_number`. Nothing at any layer refuses it — not the schema, not the types.
Today only `CreateOrderService` writes these columns and it does the right thing, but that
is a property of one caller, not of the data.

## The half that can be enforced now

```sql
ALTER TABLE public.orders ADD CONSTRAINT orders_table_mode_chk CHECK (
  fulfillment_mode = 'dine_in'
  OR (table_id IS NULL AND table_zone_name IS NULL AND table_number IS NULL)
);
```

Reads as "a table belongs only to a dine-in order". Safe against existing data: no non-dine-in
order has ever had these columns populated — they were created by this migration.

## The half that cannot, and why this is deferred rather than done

The converse — `fulfillment_mode = 'dine_in'` implies `table_id IS NOT NULL` — must NOT be added
yet, for two independent reasons:

1. **Legacy rows.** Dine-in orders that predate phase 10.3 carry their table in the free-text
   `table_identifier` column and have all three new columns NULL. The constraint would reject
   them, so the migration would fail on any database with order history.
2. **No writer exists.** Per phase 10.3 CONTEXT D-01, no client can create a dine-in order at
   all — `apps/website` hard-collapses the mode to `delivery` or `pickup`, and `apps/qr-menu`
   has no checkout. There is no behaviour to constrain.

Both halves want to land together, in the phase that builds dine-in checkout in the QR menu.
Adding only the negative half now means a second migration later, for a constraint that has
prevented nothing in the interim — the writer was always correct.

## When to pick this up

With the QR-menu checkout phase. At that point `table_identifier` needs a decision too
(backfill into the new columns, or scope the positive constraint to `created_at` after the
cutover), and both halves can be written as one constraint against a model that finally has
a real dine-in writer.
