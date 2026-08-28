---
quick_id: 260829-043
slug: catalog-admin-sends-plain-strings-for-lo
date: 2026-08-29
branch: fix-catalog-localized-write
---

# The catalog admin cannot write anything

Found while the founder tried to create a category in the admin and got
`400 validation.failed — name: Expected object, received string`.

It is not one field. The admin's catalog write layer was never aligned with the
Phase 4a API redesign. **Every** create/edit in the catalog fails. Proven with live
requests against the dev API, sending the exact payload shape the admin builds:

    categories       name: Expected object, received string
    items            name: Expected object, received string
                     basePrice: Expected string, received number
    item-sizes       menuItemId: Required
                     name: Expected object, received string
                     price: Expected string, received number
    modifier-groups  name: Expected object, received string
    modifier-options modifierGroupId: Required
                     name: Expected object, received string
                     priceDelta: Expected string, received number

Three independent breaks:

1. **Localized text.** API wants `LocalizedText` (`{"ru":"…"}`); the admin sends a
   plain string. `apps/admin/src/lib/menu/localized.ts` already exports the pair —
   `fromLocalizedText` is used in 12 places for reads, `toLocalizedText` has **zero**
   usages. The write half was never wired.
2. **Money.** `MoneyAmountValue` is a _string_ by deliberate design (money.ts:42 —
   "Never `number` — IEEE-754 silently loses precision"). The admin sends numbers.
   The read direction already knows this (`Number.parseFloat(item.basePrice)`), so
   only the write half is missing.
3. **Field names.** `itemId` vs `menuItemId`, `groupId` vs `modifierGroupId`.

Nothing caught it because the admin Playwright suites have been dead since phase
10.2 (separate todo) and the unit tests do not exercise the request body.

## Fix

At the mutation boundary in `apps/admin/src/lib/queries/catalog.ts` — forms keep
plain strings and numbers so the UI stays as it is, exactly mirroring how
`fromLocalizedText`/`parseFloat` already flatten on read.

    upsertCategory       name -> toLocalizedText
    upsertItem           name, description -> toLocalizedText; basePrice -> toFixed(2)
    upsertItemSize       name -> toLocalizedText; price -> toFixed(2); itemId -> menuItemId
    upsertModifierGroup  name -> toLocalizedText
    upsertModifierOption name -> toLocalizedText; priceDelta -> toFixed(2);
                         groupId -> modifierGroupId

`toFixed(2)` rather than `String(n)`: the API regex allows at most two fractional
digits, and a form value like 12.555 would otherwise be rejected.

## Flagged, not decided here

`DEFAULT_LOCALE` in the admin is hardcoded `'ru'`, so a GB or ES restaurant would
have its menu written under a `ru` key. Reads still work — `fromLocalizedText` falls
back to `en` and then to any locale — so this is cosmetic today, but it should follow
the tenant's own locale (derived from country: UA->ru, GB->en, ES->es). Left as is;
raise separately.

## Verification

Create all five entity types against the running dev API with the payload the admin
actually builds. Plus admin unit tests, typecheck, lint.

## Out of scope

- the dead Playwright suites (separate todo)
- multi-language editing UI
