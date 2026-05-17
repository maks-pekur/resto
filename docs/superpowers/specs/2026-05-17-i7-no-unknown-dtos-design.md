# I-7 no `unknown` in request DTOs — design

- **Status:** draft
- **Date:** 2026-05-17
- **Authoritative reference:** [ADR-0020 § Invariant I-7](../../adr/0020-multi-tenancy-and-event-bus-invariants.md)
- **Follow-on:** [writing-plans] this design feeds a single execute-phase plan.

## Context

`packages/api-client/src/generated/api.ts` is the TypeScript surface
codegen'd from `docs/api/openapi.yaml`. Five request-DTO fields in it
are currently typed as `unknown`:

| Field             | DTO                       |
| ----------------- | ------------------------- |
| `defaultCurrency` | `ProvisionTenantInputDto` |
| `slug`            | `CreateBrandInputDto`     |
| `defaultCurrency` | `SignUpInputDto`          |
| `basePrice`       | `UpsertItemInputDto`      |
| `currency`        | `UpsertItemInputDto`      |

All five trace to the same root cause: the Zod schemas backing these
fields end with `.brand<'Foo'>()` for nominal typing inside the
domain (`Currency`, `MoneyAmount`, `BrandSlug`). `nestjs-zod` v5 (the
package generating the OpenAPI doc from `createZodDto` schemas) does
not unwrap `ZodBranded` during introspection — it emits the field as
`unknown`. Consumers then have no choice but to cast (`payload.slug
as string`), which is exactly the failure mode ADR-0020 I-7 forbids:

> Consumers are NOT allowed to cast their way around an `unknown` —
> that defeats the purpose of generating types.

The `[name: string]: unknown` pattern that also appears in the
generated file (~32 occurrences) is on **response headers**, not DTO
fields. NestJS emits this by default for unspecified header shapes;
ADR-0020 I-7 scopes itself to DTO request fields. Out of scope here.

The Zod-first DTO pipeline (`createZodDto` + `RestoZodValidationPipe`

- `cleanupOpenApiDoc`) is already wired correctly. The bug is
  upstream in how branded schemas are exposed at the HTTP boundary, not
  in the pipeline.

## Goals

- Eliminate the five `unknown` request-DTO fields enumerated above.
  After this phase, `packages/api-client/src/generated/api.ts`
  contains zero `^\s+identifier(\?)?: unknown;` matches.
- Add a Vitest spec that fails the build if any future DTO regresses
  to `unknown`. The spec lives in the api package alongside other
  OpenAPI-contract assertions.
- Document the "branded vs `*Value` sibling" convention in
  `packages/domain/CLAUDE.md` so future branded schemas don't repeat
  the problem.

## Non-goals

- Path-parameter branded types (`TenantId`, `BrandId`, `UserId`).
  These travel through `@Param('id') id: string` + explicit
  `Foo.safeParse(raw)`, never through `createZodDto`. Unaffected.
- Response DTOs. They are plain TypeScript classes constructed via
  `to<Foo>Response(...)` mappers — branded types serialize to their
  underlying primitive correctly already.
- The `[name: string]: unknown` response-header pattern. Different
  semantic; not in ADR-0020 I-7 scope; CI grep gate is regex-scoped
  to leading-identifier patterns to skip it.
- `PriceDelta` branded schema. It exists in `@resto/domain` but is
  not used in any current request DTO. If a future DTO uses it, the
  CI grep gate fires and forces the sibling pattern. No proactive
  refactor.
- Upgrading or patching `nestjs-zod`. Branded unwrapping is an
  upstream feature gap; our workaround is structural in our own
  domain.

## Architecture — three layers of change

```
@resto/domain                          @resto/domain
const Currency = z.string()            const CurrencyValue = z.string()
  .regex(...)                            .regex(...);
  .brand<'Currency'>();                const Currency = CurrencyValue
                                         .brand<'Currency'>();

// HTTP DTO                            // HTTP DTO
defaultCurrency: Currency              defaultCurrency: CurrencyValue
  → generated: unknown                   → generated: string

// Service                             // Service
input.defaultCurrency // Currency      const currency =
                                         input.defaultCurrency as Currency;

// CI                                  // CI
(nothing watching)                     vitest spec greps for
                                         `: unknown;` DTO lines
```

The branded canonical type stays alive inside the domain — invariants
that depend on nominal typing (`Money` arithmetic, slug equality)
continue to work. The HTTP boundary downgrades to the underlying
primitive because nominal typing is unenforceable across the wire
anyway. The cast at the service entry is the explicit boundary mark.

## Components

### Component 1 — `@resto/domain` sibling schemas

**Files:**

- Modify: `packages/domain/src/money.ts` — refactor `Currency` and
  `MoneyAmount` to derive from new `CurrencyValue` / `MoneyAmountValue`.
- Modify: `packages/domain/src/brand-slug.ts` — refactor `BrandSlug`
  to derive from new `BrandSlugValue`.
- Modify: `packages/domain/src/index.ts` — export the three new
  `*Value` siblings alongside the branded canonicals.

**Pattern (one example shown; the other two mirror it):**

```ts
// money.ts — after:

/**
 * HTTP-boundary form: raw ISO-4217 string, no brand. Use this in
 * `createZodDto` request schemas so `nestjs-zod` emits `type: string`
 * (branded variants emit `unknown` — ADR-0020 I-7). Inside the domain
 * use `Currency`, which adds the nominal `'Currency'` brand.
 */
export const CurrencyValue = z
  .string()
  .regex(currencyRegex, 'must be a 3-letter uppercase ISO-4217 code');
export type CurrencyValue = z.infer<typeof CurrencyValue>;

export const Currency = CurrencyValue.brand<'Currency'>();
export type Currency = z.infer<typeof Currency>;
```

The regex constants stay where they are; the `.brand<>()` step is now
composed atop the unbranded base instead of being chained inline.
This is the minimal structural change.

### Component 2 — DTO updates

**Files (plan phase resolves exact paths via grep):**

- Modify: `apps/api/src/contexts/tenancy/application/dto.ts` —
  `ProvisionTenantInputSchema.defaultCurrency: Currency → CurrencyValue`.
- Modify: `apps/api/src/contexts/identity/application/dto.ts` —
  `SignUpInputSchema.defaultCurrency: Currency → CurrencyValue`.
- Modify: the catalog upsert-item DTO file — `basePrice: MoneyAmount →
MoneyAmountValue`, `currency: Currency → CurrencyValue`.
- Modify: the DTO file owning `CreateBrandInputSchema` — `slug:
BrandSlug → BrandSlugValue`.

**Pattern:**

```ts
// before
import { Currency, TenantSlug } from '@resto/domain';
const ProvisionTenantInputSchema = z.object({
  slug: TenantSlug,
  defaultCurrency: Currency,
  // …
});

// after
import { CurrencyValue, TenantSlug } from '@resto/domain';
const ProvisionTenantInputSchema = z.object({
  slug: TenantSlug,
  defaultCurrency: CurrencyValue,
  // …
});
```

`TenantSlug` (uses `.refine()`, no `.brand()`) and other unbranded
fields are unchanged.

The exported `class FooDto extends createZodDto(FooSchema) {}` is
unchanged — it inherits the new schema automatically.

### Component 3 — Service boundary cast

**Files (plan phase resolves):**

- Modify: `apps/api/src/contexts/tenancy/application/provision-tenant.service.ts`
- Modify: `apps/api/src/contexts/identity/application/<sign-up>.service.ts`
- Modify: the catalog `<upsert-item>.service.ts`
- Modify: the brand-provision service

**Pattern (one example):**

```ts
// before
async provision(input: ProvisionTenantInput): Promise<TenantSnapshot> {
  const tenant = Tenant.provision({
    slug: input.slug,
    displayName: input.displayName,
    defaultCurrency: input.defaultCurrency, // was Currency
    // …
  });
  // …
}

// after
async provision(input: ProvisionTenantInput): Promise<TenantSnapshot> {
  // RestoZodValidationPipe already validated the regex via
  // CurrencyValue. The brand is purely a TypeScript invariant — cast
  // at the HTTP→service boundary per packages/domain/CLAUDE.md
  // (ADR-0020 I-7).
  const defaultCurrency = input.defaultCurrency as Currency;
  const tenant = Tenant.provision({
    slug: input.slug,
    displayName: input.displayName,
    defaultCurrency,
    // …
  });
  // …
}
```

One named const per branded field, near the top of the service
method. Comment links the convention. Downstream code uses the
properly-branded local.

**Rejected alternative — `Currency.parse(input.defaultCurrency)`.**
Re-runs the regex (Zod already validated via `CurrencyValue`).
Defense-in-depth value is negligible against compile-time-only brand
escape; cost is a microsecond per call. Cast is cleaner.

### Component 4 — Vitest regression gate

**File:**

- Create: `apps/api/test/unit/openapi-contract.spec.ts`

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

**Why in `apps/api` and not `packages/api-client`:**

- The api package already has Vitest + `project.json` test target.
- The bug class lives in api's OpenAPI emit (controllers + DTO
  schemas). The test belongs near the source.
- api-client has no test infrastructure today; adding it just for
  one assertion is over-engineering.
- `packages/api-client/src/generated/api.ts` is committed (per the
  package's CLAUDE.md), so reading it via `readFileSync` is stable.

### Component 5 — `packages/domain/CLAUDE.md` convention

**File:**

- Modify: `packages/domain/CLAUDE.md` — add a subsection
  `### HTTP-boundary type pairing (ADR-0020 I-7)` under the existing
  `## Rules` block. (The file is gitignored per `.gitignore:62`
  `**/CLAUDE.md`, so this edit lives locally only — same caveat as
  in the I-5 PR. Documented anyway because local AI sessions read
  CLAUDE.md heavily.)

**Content (~5 bullets):** describe the sibling pattern, the DTO
usage, the service boundary cast, the regression net (the spec from
Component 4), and the explicit non-application to path-params and
response classes. Full text drafted in the plan.

## Risks and open questions for the plan phase

- **Exact location of `CreateBrandInputSchema`.** Likely under
  `apps/api/src/contexts/tenancy/.../dto.ts` or a sibling catalog
  context. Plan phase greps `grep -rln 'CreateBrandInputSchema' apps`.
- **Existing service test fixtures.** Service unit tests today
  construct inputs with branded types (because the schema's inferred
  type was branded). After Component 2 they'll need to construct
  unbranded values OR explicitly call `Currency.parse('USD')` when
  building test fixtures. Plan phase audits each affected service's
  spec.
- **`createZodDto` class export.** The class extends a generated base
  whose `.shape` reflects the schema. Refactoring the schema field
  type should not break the class — but verify that `ProvisionTenantInputDto`
  consumers (test fixtures, mocks) still compile.
- **OpenAPI emit regeneration.** After Component 2, `pnpm exec nx
run api:openapi:emit` must be run to regenerate `docs/api/openapi.yaml`
  AND `pnpm exec nx run api-client:gen` to regenerate
  `packages/api-client/src/generated/api.ts`. Both files are
  committed — they must be in the same commit (or sequential commits
  on the same branch) so the CI drift-check passes.

## Out of scope (re-stated for the plan)

- `unknown` in response headers (`[name: string]: unknown`) — NestJS
  default; not ADR-0020 I-7 scope.
- Response DTO fields — already correctly typed via `toResponse(...)`
  mappers.
- Path-param branded types (`TenantId` etc.) — separate code path.
- `PriceDelta` proactive sibling — add when first DTO uses it.
- `nestjs-zod` upgrade or patch — upstream concern; our workaround
  is structural in our own domain.
- ESLint `no-unsafe-cast` rule (ADR-0020 I-7 P2 enforcement) — would
  forbid `payload.slug as string` consumer-side casts in apps. Our
  fix removes the need for those casts entirely; the rule would
  guard against future regressions where a consumer adopts the
  pattern. Worth a separate phase if regressions surface.
