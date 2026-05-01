# @resto/domain

Single source of truth for the **business** types in Resto. Pure
TypeScript + Zod, zero framework imports, zero dependency on persistence.
Apps and other packages import shapes from here so a `MenuItem` means the
same thing in the api, the qr-menu, the future admin, mobile, and tenant
website.

## Layout

```
src/
  ids.ts             branded UUID identifiers (TenantId, MenuItemId, ...)
  money.ts           MoneyAmount, PriceDelta, Currency, Money value objects
  localized-text.ts  { en: '...', ru: '...' } record schema
  slug.ts            generic kebab-case slug
  tenant-slug.ts     tenant slug (3..64, no edge hyphens, reserved list)
  schema/            entity schemas (Zod-first, types via z.infer)
    _shared.ts       timestampsShape — createdAt / updatedAt / archivedAt
    tenant.ts        Tenant, TenantStatus
    user.ts          User, UserRole
    menu-category.ts MenuCategory
    menu-item.ts     MenuItem, MenuItemStatus
    menu-variant.ts  MenuVariant
    menu-modifier.ts MenuModifier
    index.ts         barrel re-export (internal)
  index.ts           public surface

test/
  value-objects.spec.ts
  schema.spec.ts
  branded-ids.spec.ts
```

## Rules

- **Zod is authoritative.** Define a schema, derive the type via
  `z.infer<typeof Schema>`. Never write a hand-rolled `interface` and
  hope the schema matches.
- **No imports from `@resto/db`, `@resto/events`, or any framework.**
  This package describes the _business_, not the persistence or the
  transport. Cross-cutting infrastructure imports `@resto/domain`,
  never the other way around.
- **Branded ids.** Every entity id is a UUID with a compile-time brand.
  A `MenuItemId` is not assignable to a `TenantId`; the only way to
  produce one is via the corresponding schema's `.parse(...)`. This
  makes whole classes of "passed the wrong id" bugs impossible.
- **Money is decimal-safe.** Prices and price deltas are _strings_ in
  canonical decimal form, never `number`. IEEE-754 silently corrupts
  values that look harmless (`0.1 + 0.2`) — we will not have that bug
  in a billing path.
- **Public surface is `src/index.ts`.** Anything else is internal and
  may move without notice. Consumers must not deep-import.

## Adding a new entity

1. Create `src/schema/<entity>.ts` with the Zod object schema. Reuse
   `timestampsShape` from `_shared.ts` for the audit columns. Reach for
   the existing value objects (`Currency`, `LocalizedText`,
   `MoneyAmount`) before inventing a new primitive.
2. Re-export from `src/schema/index.ts` and `src/index.ts`.
3. Add a parse / reject test to `test/schema.spec.ts`.
4. If the entity introduces a new id, add it to `src/ids.ts` and cover
   the misuse case in `test/branded-ids.spec.ts`.

## Verifying

```bash
pnpm exec nx run domain:typecheck
pnpm exec nx run domain:lint
pnpm exec nx run domain:test
```

`typecheck` runs with `strict`, `noUncheckedIndexedAccess`, and
`exactOptionalPropertyTypes` enabled (see
`packages/config-typescript/base.json`). The branded-id misuse tests in
`test/branded-ids.spec.ts` rely on `@ts-expect-error` directives — if a
brand ever becomes assignable where it should not be, `tsc` itself will
flag the unused directive.

## References

- ADR-0001 — modular monolith with DDD
- ADR-0010 — MVP-1 scope, sequencing step 2
