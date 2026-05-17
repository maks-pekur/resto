---
ticket: RES-241 (phase B of RES-235 split)
adr: 0020 (I-1), 0021 (Tier 1 — Multi-tenancy)
status: proposed
date: 2026-05-18
scope:
  - apps/api/src/contexts/catalog/infrastructure/catalog-drizzle.repository.ts (migrate to ScopedTx; manual filter for brands projection)
  - apps/api/test/e2e/catalog.e2e.spec.ts (extend with cross-tenant probe)
---

# RES-241 — Migrate `CatalogDrizzleRepository` to `ScopedTx`

## Context

`ScopedTx` landed in RES-235a (PR #145). Phase B applies it to the
first real consumer: `CatalogDrizzleRepository` (341 LOC,
`apps/api/src/contexts/catalog/infrastructure/catalog-drizzle.repository.ts`).
The migration:

- Stress-tests `ScopedTx` ergonomics on production code before phase C
  locks the door with lint.
- Closes ADR-0020 I-1 gaps at four catalog call sites (RES-241
  CR-01/02/03 — `menuVariants` and `menuModifiers` reads in
  `loadPublishedMenu`, `findPublishedItem` items read, and
  `upsertModifier` update path).
- Removes the "caller passes `tenantId` in INSERT values" pattern — the
  helper auto-injects from ALS, eliminating a hidden mismatch primitive
  (today caught by RLS WITH CHECK; after migration structurally
  impossible).

## Audit of catalog repo call sites

14 Drizzle calls total:

| #   | Line    | Method              | Operation                                                                                  | Status pre-migration                            | Migration                                                                                                                                                            |
| --- | ------- | ------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 55      | `loadPublishedMenu` | `tx.select().from(menuCategories)`                                                         | No explicit filter                              | `scoped.selectFrom(menuCategories, brandId ? eq(brandId, ...) : undefined)` — merge the two branches                                                                 |
| 2   | 62–70   | `loadPublishedMenu` | `tx.select({id, slug, displayName, theme}).from(brands).where(eq(id, brandId))`            | No tenantId filter                              | **Manual** — keep custom projection; add `eq(brands.tenantId, ctx.tenantId)` via `requireTenantContext()`. `ScopedTx` does not support column projection — see §3.2. |
| 3   | 77      | `loadPublishedMenu` | `tx.select().from(menuItems).where(itemsBaseConditions)`                                   | No tenantId filter                              | `scoped.selectFrom(menuItems, itemsBaseConditions)`                                                                                                                  |
| 4   | 82      | `loadPublishedMenu` | `tx.select().from(menuVariants)`                                                           | **CR-01** — no filter                           | `scoped.selectFrom(menuVariants)`                                                                                                                                    |
| 5   | 83      | `loadPublishedMenu` | `tx.select().from(menuItemModifiers)`                                                      | No filter                                       | `scoped.selectFrom(menuItemModifiers)`                                                                                                                               |
| 6   | 84      | `loadPublishedMenu` | `tx.select().from(menuModifiers)`                                                          | **CR-02** — no filter                           | `scoped.selectFrom(menuModifiers)`                                                                                                                                   |
| 7   | 91–99   | `loadPublishedMenu` | `tx.select().from(menuModifierOptions).where(inArray(...))`                                | No tenantId filter                              | `scoped.selectFrom(menuModifierOptions, inArray(...))`                                                                                                               |
| 8   | 190     | `findPublishedItem` | `tx.select().from(menuItems).where(where).limit(1)`                                        | **CR-03 part 1** — no filter                    | `scoped.selectFrom(menuItems, where).limit(1)`                                                                                                                       |
| 9   | 194     | `findPublishedItem` | `tx.select().from(menuVariants).where(eq(menuItemId, id))`                                 | No tenantId filter                              | `scoped.selectFrom(menuVariants, eq(menuItemId, id))`                                                                                                                |
| 10  | 196–198 | `findPublishedItem` | `tx.select().from(menuItemModifiers).where(eq(menuItemId, id))`                            | No tenantId filter                              | `scoped.selectFrom(menuItemModifiers, eq(menuItemId, id))`                                                                                                           |
| 11  | 225–246 | `upsertCategory`    | `tx.insert(menuCategories).values({tenantId, ...}).onConflictDoUpdate(...).returning(...)` | Explicit `tenantId: input.tenantId` from caller | `scoped.insertInto(menuCategories, {...without tenantId}).onConflictDoUpdate(...).returning(...)`                                                                    |
| 12  | 254–287 | `upsertItem`        | Same INSERT+onConflict+returning shape                                                     | Explicit tenantId                               | Same as #11                                                                                                                                                          |
| 13  | 298–308 | `upsertModifier`    | `tx.update(menuModifiers).set({...}).where(eq(id, input.id)).returning(...)`               | **CR-03 part 2** — no tenantId filter           | `scoped.updateTable(menuModifiers, {...}, eq(menuModifiers.id, input.id)).returning(...)`                                                                            |
| 14  | 312–322 | `upsertModifier`    | `tx.insert(menuModifiers).values({tenantId, ...}).returning(...)`                          | Explicit tenantId                               | `scoped.insertInto(menuModifiers, {...without tenantId}).returning(...)`                                                                                             |

**Migrated:** 13. **Manual:** 1 (brands projection). All four CR violations from RES-241 close as a side-effect of #4 / #6 / #8 / #13.

## Design

### 1. Migration patterns

**Pattern A — read with optional extra where:**

```ts
// before
tx.select().from(schema.menuItems).where(itemsBaseConditions);
// after
scoped.selectFrom(schema.menuItems, itemsBaseConditions);
```

**Pattern B — read with chain after `.where`:**

```ts
// before
tx.select().from(schema.menuItems).where(where).limit(1);
// after
scoped.selectFrom(schema.menuItems, where).limit(1);
```

**Pattern C — insert + onConflict + returning:**

```ts
// before
tx.insert(schema.menuCategories).values({
  ...(input.id ? { id: input.id } : {}),
  tenantId: input.tenantId,
  brandId: input.brandId ?? null,
  slug: input.slug,
  name: input.name,
  description: input.description,
  sortOrder: input.sortOrder,
})
  .onConflictDoUpdate({
    target: [schema.menuCategories.tenantId, schema.menuCategories.slug],
    set: { brandId: input.brandId ?? null, name: input.name, ... },
  })
  .returning({ id: schema.menuCategories.id })

// after — tenantId field dropped from values; helper auto-injects from ALS
scoped.insertInto(schema.menuCategories, {
  ...(input.id ? { id: input.id } : {}),
  brandId: input.brandId ?? null,
  slug: input.slug,
  name: input.name,
  description: input.description,
  sortOrder: input.sortOrder,
})
  .onConflictDoUpdate({
    target: [schema.menuCategories.tenantId, schema.menuCategories.slug],
    set: { brandId: input.brandId ?? null, name: input.name, ... },
  })
  .returning({ id: schema.menuCategories.id })
```

`onConflictDoUpdate.target` keeps the composite-key reference (`tenantId, slug`) — that's a Drizzle schema metadata pointer, not a value being inserted.

**Pattern D — update with where:**

```ts
// before
tx.update(schema.menuModifiers).set({...}).where(eq(schema.menuModifiers.id, input.id)).returning({...})
// after
scoped.updateTable(schema.menuModifiers, {...}, eq(schema.menuModifiers.id, input.id)).returning({...})
```

### 2. Brands projection — manual filter

`loadPublishedMenu` calls `tx.select({id, slug, displayName, theme}).from(brands)` with a custom column projection. `ScopedTx.selectFrom` uses `tx.select()` (all columns) — it does not support projection. Three options were considered (see §Rejected alternatives); the chosen path is **manual `eq(brands.tenantId, ctx.tenantId)` predicate**:

```ts
import { requireTenantContext } from '@resto/db';
// ...inside loadPublishedMenu, replacing lines 60–71:
const brandRowPromise = brandId
  ? tx
      .select({
        id: schema.brands.id,
        slug: schema.brands.slug,
        displayName: schema.brands.displayName,
        theme: schema.brands.theme,
      })
      .from(schema.brands)
      .where(
        // ScopedTx does not support column projection; explicit tenant filter
        // upholds ADR-0020 I-1 at this single call site.
        and(
          eq(schema.brands.tenantId, requireTenantContext().tenantId),
          eq(schema.brands.id, brandId),
        ),
      )
      .limit(1)
  : Promise.resolve([] as const);
```

`requireTenantContext()` is already inside a `withTenant` block (the surrounding `db.withTenant` guarantees ALS is bound) — the call is total and the comment explains why this site doesn't use the helper.

### 3. Caller-facing surface unchanged

The `CatalogRepository` interface (port in `domain/ports.ts`) is **not modified**. `UpsertCategoryRow.tenantId` / `UpsertItemRow.tenantId` / `UpsertModifierRow.tenantId` remain part of the DTO contract — services still pass them. The adapter just stops forwarding them to Drizzle. Cleanup of the now-redundant `tenantId` field on the input DTOs is **out of scope** (call-site changes are not in this PR; the adapter's ignore is the structural fix).

### 4. Hidden bug closure (side effect)

The four INSERT call sites currently take `tenantId: input.tenantId`. If a caller ever passed `input.tenantId !== ALS.tenantId`, the write was rejected by Postgres RLS `WITH CHECK` at INSERT time. After migration, the helper auto-injects from ALS and the input DTO's `tenantId` is structurally ignored — the mismatch is impossible to construct, RLS is no longer load-bearing for this scenario.

## Tests

### Existing — must stay green

**Unit tests** (mock the `CatalogRepository` port — adapter migration is invisible to them):

- `apps/api/test/unit/catalog/get-published-menu.service.spec.ts`
- `apps/api/test/unit/catalog/get-menu-item.service.spec.ts`
- `apps/api/test/unit/catalog/publish-menu.service.spec.ts`
- `apps/api/test/unit/catalog/upsert-category.service.spec.ts`
- `apps/api/test/unit/catalog/upsert-item.service.spec.ts`
- `apps/api/test/unit/catalog/upsert-modifier.service.spec.ts`

**E2E tests** (exercise the real Drizzle repo through HTTP):

- `apps/api/test/e2e/catalog.e2e.spec.ts`
- `apps/api/test/e2e/menu-brand-response.e2e.spec.ts`

Verification step `pnpm exec nx run api:e2e` is the **functional-equivalence regression net**. If existing cases pass, the migration is behaviour-preserving.

### New — cross-tenant probe (per RES-241 AC)

**File:** `apps/api/test/e2e/catalog.e2e.spec.ts` (extend).

**Shape:** seed tenant A and tenant B with distinct `menuItems` / `menuVariants` / `menuModifiers`. Tenant A queries the published-menu endpoint. Expectation: response contains only A's rows; none of B's variant or modifier IDs appear.

**Concrete details** (resolved at impl time): existing `catalog.e2e.spec.ts` already has tenant-bootstrap helpers — mirror its pattern.

**Why this probe is valuable** even though the migration is functionally equivalent: it pins ADR-0020 I-1 behaviour as a regression net. Before migration, RLS caught cross-tenant leaks. After migration, ScopedTx's explicit filter is the first line of defense + RLS is the second. The probe survives both regimes; its real value emerges if the ScopedTx filter ever drifts.

### Skipped — per-method "no ALS → throws" units (per RES-241 AC literal)

The AC literally says "Repository unit test asserts 'no ALS → throws' for each of the four call sites." Skipped intentionally because:

- `db.withTenant(...)` already throws via `requireTenantContext()` if ALS unbound. Covered by `packages/db/test/integration/with-tenant-id.spec.ts` + `tenant-isolation.spec.ts`.
- `ScopedTx` construction paths (RES-235a) guarantee tenant context. Repo methods cannot be invoked outside a `withTenant`-block.

Adding per-method units would test the wrapper, not catalog code. PR comment surfaces this rationale.

## Rollout

### Branch + commits

- **Branch:** `res-235b` (already created from `main`).
- **Two atomic commits** (bisect-friendly):

  ```
  refactor(api): migrate CatalogDrizzleRepository to ScopedTx (closes I-1 CR-01/02/03)
  test(api): add cross-tenant probe to catalog e2e
  ```

  Two commits over one: (a) the migration is functionally equivalent on its own — revertable as a unit; (b) the test addition is independent value with no production-code coupling.

### Verification

In order:

1. **Pre-flight grep** — confirm 14 Drizzle call sites in catalog repo (sanity vs the table above):

   ```bash
   grep -n "tx\.\(select\|insert\|update\)" apps/api/src/contexts/catalog/infrastructure/catalog-drizzle.repository.ts
   ```

2. **Apply migration** (Commit 1 content).

3. **Typecheck** — critical: `scoped.insertInto(...).onConflictDoUpdate(...).returning(...)` and `scoped.updateTable(...).returning(...)` chains must resolve:

   ```bash
   pnpm exec nx run api:typecheck
   ```

4. **Lint:**

   ```bash
   pnpm exec nx run api:lint
   ```

5. **Unit tests:**

   ```bash
   pnpm exec nx run api:test
   ```

6. **E2E** (without new probe yet — regression net):

   ```bash
   pnpm exec nx run api:e2e
   ```

7. **Commit 1.**

8. **Add cross-tenant probe** (Commit 2 content).

9. **Re-run e2e** — new case + existing all green:

   ```bash
   pnpm exec nx run api:e2e
   ```

10. **Commit 2.**

11. **Final grep audit** — verify migration completeness:
    ```bash
    grep -n "tx\." apps/api/src/contexts/catalog/infrastructure/catalog-drizzle.repository.ts
    ```
    Expected: exactly 1 hit — the manual brands projection query (which carries an explicit `eq(brands.tenantId, ctx.tenantId)`).

### PR + Linear

- PR title: `refactor(api): migrate catalog repo to ScopedTx (closes RES-241)`.
- PR body: empty per project policy.
- Linear:
  - **RES-241** → In Review on PR open; attach PR link. Move to Done on merge.
  - **RES-235** → comment noting phase B is in flight (the catalog migration). RES-235 stays In Progress until phase C lands.

## Out of scope

- **Brand and tenant repo migrations** — `brand-drizzle.repository.ts` (198 LOC, mostly already filters explicitly) is phase C audit material. `tenant-drizzle.repository.ts` not in scope (the `tenants` table itself has no `tenantId` column).
- **ESLint guard** against raw `tx.select().from(<tenant-scoped table>)` outside repos — phase C (future RES-235c).
- **`withoutTenant` allowlist mechanism** — phase C.
- **Wider e2e cross-tenant coverage per bounded context** — RES-237.
- **Removing `tenantId` from `UpsertCategoryRow` / `UpsertItemRow` / `UpsertModifierRow` DTOs** — caller-facing change; out of scope. Adapter just ignores the field.
- **Convenience methods on ScopedTx** (`findById`, `upsert`) — YAGNI. The migration shows the four base methods suffice for catalog needs.

## Rejected alternatives

- **Extend `ScopedTx` with `selectColumnsFrom(table, columns, extraWhere)`.** Retroactive API expansion of phase A, requires touching `packages/db` again and rolling out a second package commit before the catalog migration lands. The manual-filter alternative at one call site is cheaper and just as I-1-compliant.
- **Refactor brands projection to use full SELECT (`scoped.selectFrom(brands, eq(brands.id, brandId))`) and map columns in JS.** Works but reads more columns than needed (small perf cost) and obscures intent at the call site. The manual filter preserves the projection's signal that this query is intentionally narrow.
- **Single commit for migration + test.** Fewer commits in the log but loses the "migration is functionally equivalent" invariant as an isolated artifact. Two commits beat one for bisect.
- **Migrate `BrandDrizzleRepository` in the same PR.** Audit shows it mostly already filters; the marginal value is small and the scope creep is real. Defer to phase C audit.

## Open design notes

Resolved at implementation time:

1. **`scoped.insertInto(...).onConflictDoUpdate(...).returning(...)` typecheck.** ScopedTx's `insertInto` returns the same builder shape as `tx.insert().values()` (a `PgInsertBase<...>`), which supports both chains. Verification step 3 confirms; if it fails, the fix is additional `as never` casts in ScopedTx's return type — discovered and resolved inline.

2. **`scoped.updateTable(...).returning(...)` typecheck.** Same family of concern; same verification path.

3. **Cross-tenant probe seed shape.** Mirror the existing `catalog.e2e.spec.ts` tenant-bootstrap helpers. Concrete fixture details resolved at impl time.

4. **Whether to combine the two `categoriesQuery` branches in `loadPublishedMenu` (current code creates `categoriesQuery` then conditionally `.where()`s).** After migration both branches collapse into a single `scoped.selectFrom(menuCategories, brandId ? eq(brandId, ...) : undefined)` call. Verify this reads naturally; if not, keep an `if/else` for clarity.

## References

- [ADR-0020 — Multi-tenancy and event-bus invariants](../../adr/0020-multi-tenancy-and-event-bus-invariants.md) — invariant I-1.
- [ADR-0021 — Layered milestone strategy](../../adr/0021-layered-milestone-strategy.md) — Tier 1.
- [RES-235a spec](./2026-05-17-res-235a-scoped-tx-design.md) — defines the `ScopedTx` primitive this PR consumes.
- Linear: RES-241 (this ticket, AC closure); RES-235 (parent phase tracker); RES-237 (wider e2e cross-tenant — separate); RES-235c (phase C — separate, to be created).
