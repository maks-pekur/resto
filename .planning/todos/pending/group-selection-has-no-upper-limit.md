---
title: A modifier group cannot say "choose up to N" or "choose at least N"
date: 2026-09-03
priority: medium
status: pending
---

# `behaviour: several` means unlimited — there is no way to cap a group's selection

Phase 10.6 replaced `menu_modifier_groups.min_selectable` / `max_selectable` with two
explicit fields plus a flag: `display` (tiles | tabs), `behaviour` (one | several) and
`is_required`. That was decisions D-07 and D-33, taken deliberately at plan time — the
goal was that the operator never types a number.

The founder re-opened the question mid-phase (2026-09-03, during wave 7) and, after
seeing exactly what is and is not covered, chose to keep the simplification and handle
the gap as its own phase later. This file records the gap so it is not rediscovered by
a customer.

## What IS covered (verified in code, not assumed)

`apps/api/src/contexts/ordering/application/create-order.service.ts:161-166` enforces:

```
if (group.isRequired && count === 0)        -> refuse, "a selection is required"
if (group.behaviour === 'one' && count > 1) -> refuse, "only one selection allowed"
```

So these work today:

| Need | Configuration |
|------|---------------|
| Exactly one, mandatory (dough type) | `behaviour: one` + `is_required: true` |
| Optional single choice | `behaviour: one` + `is_required: false` |
| Any number | `behaviour: several` |

## What is NOT covered

| Need | Status |
|------|--------|
| "Choose up to 3 toppings" | No upper bound. `several` is unlimited. |
| "Choose at least 2 sides" | `is_required` only means "at least one". |

Do not confuse this with `menu_modifier_options.min_amount` / `max_amount`, which
survive the reshape. Those are a different axis — how many portions of ONE ingredient
("double cheese"), not how many DIFFERENT ingredients may be picked from a group.

## Why it matters eventually

"Up to N included, extra ones cost more" and "pick 2 of 5 sides" are ordinary
restaurant patterns, and iiko models them. The project's stated intent is to keep the
catalog model close to iiko's shapes so the MVP-3 partner integration is cheap — this
is one place where the two diverge.

Not MVP-1 blocking: a restaurant can publish a menu and take paid orders without it.

## Suggested shape when it is picked up

Keep D-07's intent rather than reverting it. The two buttons stay the default; an
optional "no more than N" field appears only when `behaviour: several` is chosen, and
an empty value means unlimited. That preserves "the operator never types a number" for
the common case while making the rare case expressible.

Work involved: one migration adding a nullable smallint to `menu_modifier_groups`,
the field threaded through the group DTO and service, one more branch in
`create-order.service.ts` beside the two above, one field in the admin group editor,
and optionally a hint on the guest pill strip.

## Related

- `.planning/phases/10.6-ingredient-library-groups-and-how-they-reach-the-order/10.6-CONTEXT.md`
  D-07 (lines 53-56), D-11 (63-64), D-33 (142-148) — the original decisions and the
  migration-time derivation `max_selectable = 1 -> tabs+one`, `> 1 -> tiles+several`.
- `packages/db/migrations/0019_ingredient_library.sql` — where the columns were dropped.
