# I-7 no `unknown` in request DTOs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the 5 `unknown` request-DTO fields in `packages/api-client/src/generated/api.ts` by introducing non-branded `*Value` siblings in `@resto/domain`, swapping them into DTOs, and casting at the service boundary (ADR-0020 § Invariant I-7).

**Architecture:** Domain pkg gains `CurrencyValue`/`MoneyAmountValue`/`BrandSlugValue` (raw `z.string().regex(...)`); branded canonicals (`Currency` etc.) become `Value.brand<>()`. The 4 DTO schemas (3 in `application/dto.ts` files + 1 inline in `me-brands.controller.ts`) switch to the `*Value` siblings. The 4 services that consume those DTOs add an `input.<field> as <Branded>` named const at method entry — Zod-pipeline already validated the regex, brand is purely TS. A new Vitest spec (`apps/api/test/unit/openapi-contract.spec.ts`) greps the generated client for offending `unknown` lines and fails the build on regression. After DTO swap, regenerate `docs/api/openapi.yaml` (via `api:openapi:emit`) and `packages/api-client/src/generated/api.ts` (via `api-client:gen`) — both committed.

**Tech Stack:** TypeScript 6.0 · NestJS · Zod v3 (`createZodDto`, `nestjs-zod` v5.3) · Vitest 2 · `openapi-typescript` v7

**Spec:** [`docs/superpowers/specs/2026-05-17-i7-no-unknown-dtos-design.md`](../specs/2026-05-17-i7-no-unknown-dtos-design.md)

**Branch:** `i7-no-unknown-dtos` (spec already committed there as `2b18447`).

---

## Pre-flight

- Confirm branch: `git branch --show-current` → `i7-no-unknown-dtos`.
- Lockfile current; no `pnpm install` needed.
- Docker not required (all changes are typecheck-only or unit-test-only).

---

## Task 1 — Vitest regression gate (RED commit)

Add the test first. It fails on the current `packages/api-client/src/generated/api.ts` (5 offending lines). Subsequent tasks land the fix; Task 4 regenerates the artifact and turns the test GREEN.

**Files:**

- Create: `apps/api/test/unit/openapi-contract.spec.ts`

- [ ] **Step 1: Create the spec**

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const GENERATED_PATH = resolve(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'packages',
  'api-client',
  'src',
  'generated',
  'api.ts',
);

describe('I-7 — generated api-client has no `unknown` in DTO fields', () => {
  it('emits typed primitives for all request DTO fields', () => {
    const source = readFileSync(GENERATED_PATH, 'utf8');
    // `  fieldName: unknown;` or `  fieldName?: unknown;` at the
    // start of an indented line. Excludes `[name: string]: unknown`
    // (response headers — NestJS default, not in ADR-0020 I-7 scope).
    const offenders = source
      .split('\n')
      .filter((line) => /^\s+[a-zA-Z_$][\w$]*\??: unknown;/.test(line));
    expect(
      offenders,
      `I-7 violation: ${offenders.length} DTO field(s) typed as 'unknown' — ` +
        `fix upstream via a non-branded Zod sibling (ADR-0020 I-7,` +
        ` packages/domain/CLAUDE.md):\n` +
        offenders.map((l) => '  ' + l.trim()).join('\n'),
    ).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the spec to verify it fails for the right reason**

Run: `pnpm --filter @resto/api test -- openapi-contract`

Expected: FAIL with 5 offending lines listed (`defaultCurrency: unknown;`, `slug: unknown;`, `defaultCurrency: unknown;`, `basePrice: unknown;`, `currency: unknown;`). If a different number appears, STOP and report — the file may already have been touched.

- [ ] **Step 3: Commit the failing test**

(Deliberate RED on the branch — Tasks 2-4 make it pass, Task 5 verifies. The RED commit preserves bisect attribution.)

```bash
git add apps/api/test/unit/openapi-contract.spec.ts
git commit -m "test(api): assert no \`unknown\` in generated DTO fields (ADR-0020 I-7)"
```

---

## Task 2 — Domain `*Value` sibling schemas

Add unbranded siblings to `@resto/domain` and refactor the branded canonicals to derive from them. Pure addition + structural composition — no existing consumers break.

**Files:**

- Modify: `packages/domain/src/money.ts`
- Modify: `packages/domain/src/brand-slug.ts`
- Modify: `packages/domain/src/index.ts`

- [ ] **Step 1: Update `packages/domain/src/money.ts`**

Replace the existing `Currency` block (currently around lines 55-61) with the sibling pattern. Same for `MoneyAmount` (around lines 26-32). The regex constants and JSDoc above each schema stay verbatim.

```ts
/**
 * HTTP-boundary form — raw decimal string, no brand. Use this in
 * `createZodDto` request schemas; `nestjs-zod` emits `type: string`
 * for it (the branded variant emits `unknown` — ADR-0020 I-7).
 * Inside the domain use `MoneyAmount`.
 */
export const MoneyAmountValue = z
  .string()
  .regex(
    moneyAmountRegex,
    'must be a non-negative decimal with up to 2 fractional digits',
  );
export type MoneyAmountValue = z.infer<typeof MoneyAmountValue>;

export const MoneyAmount = MoneyAmountValue.brand<'MoneyAmount'>();
export type MoneyAmount = z.infer<typeof MoneyAmount>;
```

And:

```ts
/**
 * HTTP-boundary form — raw ISO-4217 alphabetic code, no brand. Use
 * this in `createZodDto` request schemas; `nestjs-zod` emits
 * `type: string` for it (the branded variant emits `unknown` —
 * ADR-0020 I-7). Inside the domain use `Currency`.
 */
export const CurrencyValue = z
  .string()
  .regex(currencyRegex, 'must be a 3-letter uppercase ISO-4217 code');
export type CurrencyValue = z.infer<typeof CurrencyValue>;

export const Currency = CurrencyValue.brand<'Currency'>();
export type Currency = z.infer<typeof Currency>;
```

Leave `PriceDelta` alone (not used in any current request DTO).

- [ ] **Step 2: Update `packages/domain/src/brand-slug.ts`**

Replace the existing `BrandSlug` block:

```ts
/**
 * HTTP-boundary form — raw lowercase slug, no brand. Use this in
 * `createZodDto` request schemas; `nestjs-zod` emits `type: string`
 * for it (the branded variant emits `unknown` — ADR-0020 I-7).
 * Inside the domain use `BrandSlug`.
 */
export const BrandSlugValue = z
  .string()
  .min(3)
  .max(64)
  .toLowerCase()
  .refine((value) => BRAND_SLUG_RE.test(value), {
    message:
      'Brand slug must be lowercase alphanumeric with hyphens, 3–64 chars, not starting or ending with a hyphen.',
  });
export type BrandSlugValue = z.infer<typeof BrandSlugValue>;

export const BrandSlug = BrandSlugValue.brand<'BrandSlug'>();
export type BrandSlug = z.infer<typeof BrandSlug>;
```

- [ ] **Step 3: Update `packages/domain/src/index.ts`**

Add three exports alongside the branded canonicals (find the existing `export … Currency` / `MoneyAmount` / `BrandSlug` re-export lines and add the `*Value` siblings on adjacent lines):

```ts
export {
  CurrencyValue,
  MoneyAmountValue /* alongside Currency, MoneyAmount */,
} from './money';
export { BrandSlugValue /* alongside BrandSlug */ } from './brand-slug';
```

(If the barrel uses a different export style — `export * from './money'` — then the new symbols are already exposed once they exist in the source file. Plan-verify by reading the existing barrel.)

- [ ] **Step 4: Typecheck the domain package**

Run: `pnpm exec nx run domain:typecheck`

Expected: clean. The branded types are now composed atop the unbranded siblings — semantically identical at runtime, identical TypeScript type via `z.infer`, so no consumer breaks.

Run domain unit tests too: `pnpm exec nx run domain:test`

Expected: clean. Existing property tests for Currency/MoneyAmount/BrandSlug exercise the same regex/refine surface (now via composition).

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/money.ts packages/domain/src/brand-slug.ts packages/domain/src/index.ts
git commit -m "refactor(domain): expose CurrencyValue/MoneyAmountValue/BrandSlugValue siblings (ADR-0020 I-7)"
```

---

## Task 3 — DTO + service migration

Swap the 4 DTO schemas to the `*Value` siblings AND add the boundary cast in their 4 consuming services. Bundled because they share a typecheck wave: changing the DTO alone makes services not compile; changing services first is a no-op (cast accepts both types). Single atomic commit.

**Files:**

- Modify: `apps/api/src/contexts/tenancy/application/dto.ts`
- Modify: `apps/api/src/contexts/identity/application/dto.ts`
- Modify: `apps/api/src/contexts/catalog/application/dto.ts`
- Modify: `apps/api/src/contexts/identity/interfaces/http/me-brands.controller.ts` (inline `CreateBrandInputSchema` at line 52)
- Modify: `apps/api/src/contexts/tenancy/application/provision-tenant.service.ts`
- Modify: `apps/api/src/contexts/identity/application/signup.service.ts`
- Modify: `apps/api/src/contexts/catalog/application/upsert-item.service.ts`
- Modify: `apps/api/src/contexts/identity/application/create-my-brand.service.ts`

- [ ] **Step 1: Update `apps/api/src/contexts/tenancy/application/dto.ts`**

```ts
// before (around lines 1-13)
import { Currency, TenantSlug } from '@resto/domain';

export const ProvisionTenantInputSchema = z.object({
  slug: TenantSlug,
  displayName: z.string().min(1).max(120),
  locale: z
    .string()
    .regex(/^[a-z]{2}(?:-[A-Z]{2})?$/)
    .default('en'),
  defaultCurrency: Currency,
});

// after
import { CurrencyValue, TenantSlug } from '@resto/domain';

export const ProvisionTenantInputSchema = z.object({
  slug: TenantSlug,
  displayName: z.string().min(1).max(120),
  locale: z
    .string()
    .regex(/^[a-z]{2}(?:-[A-Z]{2})?$/)
    .default('en'),
  defaultCurrency: CurrencyValue,
});
```

Other schemas in the same file (`ScheduleOffboardingInputSchema`, `CancelOffboardingInputSchema`) — unchanged.

- [ ] **Step 2: Update `apps/api/src/contexts/identity/application/dto.ts`**

The file imports `Currency` at line 3 and uses it on `SignUpInputSchema.defaultCurrency` at line 9. Change the import to `CurrencyValue` and the schema field to `CurrencyValue`. Pattern is identical to Step 1.

- [ ] **Step 3: Update `apps/api/src/contexts/catalog/application/dto.ts`**

The file imports `Currency, LocalizedText, MoneyAmount, Slug` at line 3 and uses both in `UpsertItemInputSchema` at lines 23-24. Change the import to add `CurrencyValue, MoneyAmountValue` and swap the schema fields:

```ts
// before (lines 3, 23-24)
import { Currency, LocalizedText, MoneyAmount, Slug } from '@resto/domain';
// ...
  basePrice: MoneyAmount,
  currency: Currency,

// after
import { CurrencyValue, LocalizedText, MoneyAmountValue, Slug } from '@resto/domain';
// ...
  basePrice: MoneyAmountValue,
  currency: CurrencyValue,
```

If the file uses `Currency` or `MoneyAmount` elsewhere (e.g., in other schemas in the same file), keep those branded imports alongside. Run `grep -n 'Currency\|MoneyAmount' apps/api/src/contexts/catalog/application/dto.ts` to confirm.

- [ ] **Step 4: Update `apps/api/src/contexts/identity/interfaces/http/me-brands.controller.ts`**

The inline schema at line 52:

```ts
// before
import { BrandSlug, TenantId } from '@resto/domain';
// …
const CreateBrandInputSchema = z.object({
  slug: BrandSlug,
  displayName: z.string().min(1).max(120),
});

// after
import { BrandSlug, BrandSlugValue, TenantId } from '@resto/domain';
// …
const CreateBrandInputSchema = z.object({
  slug: BrandSlugValue,
  displayName: z.string().min(1).max(120),
});
```

Keep `BrandSlug` in the import — the controller may still need the branded type elsewhere (verify by grep).

- [ ] **Step 5: Update `apps/api/src/contexts/tenancy/application/provision-tenant.service.ts`**

Find the method that takes `ProvisionTenantInput` and uses `input.defaultCurrency`. Add a named const at the top of the method:

```ts
import { Currency, TenantId, TenantSlug } from '@resto/domain';
// … (rest of imports unchanged)

async provision(input: ProvisionTenantInput): Promise<TenantSnapshot> {
  // RestoZodValidationPipe already validated the regex via
  // CurrencyValue (packages/domain/src/money.ts). Brand is purely TS;
  // cast at the HTTP→service boundary per ADR-0020 I-7.
  const defaultCurrency = input.defaultCurrency as Currency;

  // …existing body, replace `input.defaultCurrency` with `defaultCurrency`
  // wherever it appeared.
}
```

Add `Currency` to the `@resto/domain` import line if not already present.

- [ ] **Step 6: Update `apps/api/src/contexts/identity/application/signup.service.ts`**

Same pattern as Step 5. The service has a method taking `SignUpInput`; at its top:

```ts
const defaultCurrency = input.defaultCurrency as Currency;
```

Add `Currency` import from `@resto/domain` if absent. Replace downstream `input.defaultCurrency` references with `defaultCurrency`.

- [ ] **Step 7: Update `apps/api/src/contexts/catalog/application/upsert-item.service.ts`**

Two fields to cast — `basePrice` and `currency`:

```ts
async upsert(input: UpsertItemInput, /* other args */): Promise<…> {
  const basePrice = input.basePrice as MoneyAmount;
  const currency = input.currency as Currency;

  // …existing body, replace input.basePrice / input.currency with the locals.
}
```

Add `Currency, MoneyAmount` to the `@resto/domain` import if absent.

- [ ] **Step 8: Update `apps/api/src/contexts/identity/application/create-my-brand.service.ts`**

```ts
async createBrand(input: CreateBrandInput, /* other args */): Promise<…> {
  const slug = input.slug as BrandSlug;

  // …existing body, replace input.slug with slug.
}
```

Add `BrandSlug` import from `@resto/domain` if absent.

- [ ] **Step 9: Typecheck**

Run: `pnpm exec nx run api:typecheck`

Expected: clean. All four DTO type changes propagate through `z.infer`; the four service casts bring the inferred string back to its branded canonical for downstream code.

- [ ] **Step 10: Run the api unit + e2e suites**

```bash
pnpm --filter @resto/api test
```

Expected: green. (The new openapi-contract.spec from Task 1 is still RED — it reads the OLD generated/api.ts which we haven't regenerated yet. That's expected; Task 4 regenerates and turns it GREEN.)

If any unit test fails because it constructs `Currency`/`MoneyAmount`/`BrandSlug` test fixtures expecting branded types but now gets strings — fix the fixture by parsing through the branded schema (`Currency.parse('USD')` to get a branded test value).

- [ ] **Step 11: Commit**

```bash
git add apps/api/src/contexts/tenancy/application/dto.ts \
        apps/api/src/contexts/identity/application/dto.ts \
        apps/api/src/contexts/catalog/application/dto.ts \
        apps/api/src/contexts/identity/interfaces/http/me-brands.controller.ts \
        apps/api/src/contexts/tenancy/application/provision-tenant.service.ts \
        apps/api/src/contexts/identity/application/signup.service.ts \
        apps/api/src/contexts/catalog/application/upsert-item.service.ts \
        apps/api/src/contexts/identity/application/create-my-brand.service.ts
git commit -m "refactor(api): swap branded DTOs to *Value siblings, cast at service entry (ADR-0020 I-7)"
```

---

## Task 4 — Regenerate OpenAPI artifacts

After Task 3 the controller surface still emits the same OpenAPI YAML structurally — but with `type: string` instead of nothing — for the 5 fields. Regenerate both `docs/api/openapi.yaml` and `packages/api-client/src/generated/api.ts`. Same commit (CI's openapi-drift gate fails on either being stale relative to the other).

**Files:**

- Modify (regenerated, not hand-edited): `docs/api/openapi.yaml`
- Modify (regenerated, not hand-edited): `packages/api-client/src/generated/api.ts`

- [ ] **Step 1: Regenerate the OpenAPI spec**

```bash
pnpm exec nx run api:openapi:emit
```

This boots the Nest app in test mode without a real HTTP listener, generates the OpenAPI document from controller decorators + Zod schemas, and writes `docs/api/openapi.yaml`. Expect ~5-15s.

- [ ] **Step 2: Regenerate the typed client**

```bash
pnpm exec nx run api-client:gen
```

This runs `openapi-typescript ../../docs/api/openapi.yaml -o ./src/generated/api.ts`. Fast (<1s).

- [ ] **Step 3: Verify the offenders are gone**

```bash
grep -E '^\s+[a-zA-Z_$][\w$]*\??: unknown;' packages/api-client/src/generated/api.ts
```

Expected: NO output (zero offenders). If grep finds any, STOP and investigate — likely a missed DTO file or service that still uses branded types via a different path.

For confidence, also run the vitest gate created in Task 1:

```bash
pnpm --filter @resto/api test -- openapi-contract
```

Expected: PASS (the test that was RED in Task 1 is now GREEN).

- [ ] **Step 4: Run full api test suite**

```bash
pnpm --filter @resto/api test
```

Expected: green across api unit + e2e.

- [ ] **Step 5: Commit**

```bash
git add docs/api/openapi.yaml packages/api-client/src/generated/api.ts
git commit -m "chore(api-client): regenerate after I-7 DTO swap"
```

---

## Task 5 — `packages/domain/CLAUDE.md` convention doc

Add a subsection documenting the sibling pattern so future branded schemas don't repeat the problem.

**Caveat:** `**/CLAUDE.md` is gitignored (`.gitignore:62`) by intentional project convention. The edit lives **locally only** — `git add` will refuse the file. Apply the edit anyway because local AI sessions read CLAUDE.md heavily; future-me on a fresh clone won't see this section, which is a known design tension (tracked in [[adr-0020-followup]] memory).

**Files:**

- Modify (local only): `packages/domain/CLAUDE.md`

- [ ] **Step 1: Add the subsection**

In `packages/domain/CLAUDE.md`, find the `## Rules` block. Add this new subsection after the existing `### Schema composition` subsection (or wherever fits the existing flow):

````markdown
### HTTP-boundary type pairing (ADR-0020 I-7)

- **Every `.brand<>()` schema used in `createZodDto` request schemas
  must expose a non-branded sibling.** `nestjs-zod` does not unwrap
  `ZodBranded` for OpenAPI introspection — branded fields emit as
  `unknown` in the generated `@resto/api-client` types, which forces
  consumers to cast around the type system (the failure mode
  ADR-0020 I-7 forbids).

- **Pairing pattern:**

  ```ts
  // The unbranded sibling — exposed at the HTTP boundary.
  export const CurrencyValue = z
    .string()
    .regex(currencyRegex, 'must be a 3-letter uppercase ISO-4217 code');
  export type CurrencyValue = z.infer<typeof CurrencyValue>;

  // The branded canonical — used inside the domain for invariants.
  export const Currency = CurrencyValue.brand<'Currency'>();
  export type Currency = z.infer<typeof Currency>;
  ```

- **DTO schemas use the `*Value` sibling. Application services
  cast `as Foo` at their entry**, treating the boundary as the brand
  injection point. The cast is safe because the regex validation
  already ran via `RestoZodValidationPipe`.

- **Regression net:** `apps/api/test/unit/openapi-contract.spec.ts`
  asserts that `packages/api-client/src/generated/api.ts` contains
  no `: unknown;` DTO fields. Any new branded schema used in a DTO
  that forgot a sibling will fail this test.

- **Not required for path-param brands** (`TenantId`, `BrandId`,
  `UserId`). Those go through `@Param('id') id: string` + explicit
  `.safeParse()`, never via `createZodDto`. They're unaffected.

- **Not required for response classes.** Response DTOs are plain
  TypeScript classes constructed by `to<Foo>Response(...)` mappers,
  not Zod-derived. They serialize branded types as their underlying
  primitive automatically.
````

- [ ] **Step 2: Confirm the gitignore behaviour**

```bash
git check-ignore -v packages/domain/CLAUDE.md
```

Expected: `.gitignore:62:**/CLAUDE.md	packages/domain/CLAUDE.md` (file is ignored). The edit is local only.

NO commit for this task — the file is gitignored. Report the unstaged local edit in the final task summary.

---

## Task 6 — Final verification

- [ ] **Step 1: Run typecheck for all projects**

```bash
pnpm exec nx run-many --target=typecheck --all
```

Expected: 8/8 projects green.

- [ ] **Step 2: Run all tests**

```bash
pnpm exec nx run-many --target=test --all
```

Expected: green across api (full unit + e2e), events, qr-menu, admin, domain, db.

- [ ] **Step 3: Run lint where it was clean on main**

```bash
pnpm exec nx run-many --target=lint --projects=qr-menu,admin,events
```

Expected: green.

- [ ] **Step 4: Confirm the generated client is clean**

```bash
grep -cE '^\s+[a-zA-Z_$][\w$]*\??: unknown;' packages/api-client/src/generated/api.ts
```

Expected: `0`.

- [ ] **Step 5: Inspect commit log**

```bash
git log main..HEAD --oneline
```

Expected: spec commit `2b18447` + 4 implementation commits from Tasks 1-4 (Tasks 5 and 6 produce no commits). All Conventional Commits, single-line subjects, no Claude attribution.

- [ ] **Step 6: Hand off**

Stop. Ask the user before `git push` and before opening a PR.

---

## Out of scope (re-stated)

- `[name: string]: unknown` response headers — NestJS default, different semantic, not ADR-0020 I-7 scope.
- Response DTOs — already correctly typed via `toResponse(...)` mappers.
- Path-param branded types (`TenantId`, `BrandId`, `UserId`).
- `PriceDelta` sibling — add when first DTO uses it. Vitest gate will force the issue.
- ESLint `no-unsafe-cast` rule (ADR-0020 I-7 P2 enforcement) — separate phase.
- `nestjs-zod` upgrade or patch.
