# @resto/domain

## Purpose

Pure TypeScript domain types and Zod schemas. **Single source of truth for
business types** consumed by apps and integrations. Framework-agnostic by
construction: zero NestJS / Drizzle / network / DB imports.

## Layout

- `src/ids.ts` — branded ID types (`TenantId`, `UserId`, …).
- `src/schema/` — entity schemas (`tenant`, `menu-*`, `user`,
  `customer-profile`, …) and shared shapes (`_shared`).
- `src/rbac/` — permission catalogue + system roles. Consumed at api-boot
  to construct Better Auth's accessControl statements (ADR-0013).
- Value-object schemas at root: `money`, `slug`,
  `tenant-slug`, `tenant-theme`, `localized-text`.
- `src/index.ts` — barrel. The only public surface; everything else is
  internal.

## Rules

### Layering (hard)

- **Zero infrastructure imports.** No `@nestjs/*`, `drizzle-orm`, `pg`,
  `axios`, `express`, `fs`, network primitives. Allowed: `zod` and pure
  utilities. Enforced by a `dependency-cruiser` rule (planned) and a
  smoke test that imports every file and asserts the resolved module
  graph contains no forbidden roots.
- **No tenant-aware logic.** Tenant context is enforced at the
  application/repository layer; the domain has no concept of "current
  tenant." It does have a `tenantId: TenantId` field on entities — that
  is a data shape, not behaviour.

### Schema discipline

- **Zod schemas are authoritative; types are derived via `z.infer`.**
  Never declare a `type Foo = { … }` and then a separate `const Foo =
z.object({ … })` — they will drift.
- **Free-text fields MUST have a max length.** `z.string().min(1)` with
  no `.max(…)` is a DoS vector at the HTTP boundary. Default cap for
  human-entered text: 4 KiB.
- **URL fields MUST restrict scheme.** `z.string().url()` accepts
  `javascript:` and `data:`. Anything that lands in `<img src>`,
  `<a href>`, or CSS `url(...)` is an XSS vector. Use
  `.refine(u => /^https?:/i.test(u), 'must be http(s)')`.
- **Style/identifier fields rendered into CSS MUST use an allowlist.**
  `TenantTheme.font` with no charset restriction allows CSS injection if
  a consumer interpolates it into `font-family: ${font};`. Restrict to
  `/^[A-Za-z0-9 ,'"\-]+$/` or, better, a fixed enum of approved tokens.
- **Money never uses floats.** Integer-cents pattern. Currency code
  validated against ISO-4217 (or a project-supported subset).
- **Per-currency fields stored as canonical decimal strings.** `'10.00'`
  and `'10' ` and `'10.0'` MUST NOT all be valid for the same value.
  Either canonicalise at parse-time or document the non-canonical
  acceptance explicitly (currently accepted; flag for canonicalisation).
- **Slugs are lowercase by regex.** Reserved-slug enforcement runs
  case-INSENSITIVELY (`RESERVED_SET.has(v.toLowerCase())`) — defense in
  depth in case a request bypasses the regex. Reject `^xn--` prefixes
  (RFC 3490 IDN punycode) to avoid homograph confusion on subdomains.
- **BCP-47 locale schema MUST be shared, not duplicated.** Hoist into a
  single `BcpLocale` export and import from every schema. Duplicating the
  `^[a-z]{2}(?:-[A-Z]{2})?$` regex across `localized-text.ts` and
  `schema/tenant.ts` is a drift trap.

### Schema composition

- **Do NOT apply `.refine()` to the root of an object schema you expect
  consumers to compose.** `.refine()` returns `ZodEffects`, which blocks
  `.partial()` / `.extend()` / `.omit()` / `.pick()`. If a schema needs
  a refinement, expose the base `z.object(...)` and apply the refinement
  only at the parse boundary (`Foo.refine(...).parse(input)`).
- **`.strip()` is the Zod default — drop the explicit call.** If you
  want strict unknown-key rejection use `.strict()`; if forward
  compatibility is intentional, the default behaviour already does it.

### RBAC

- **System roles are immutable in code** (`owner`, `admin`, `staff` per
  ADR-0013). Tenant-creatable roles persist in BA's `organization_role`
  table; the domain does not model them.
- **Adding a permission to `admin` requires a passing regression test
  that pins what admin must NOT receive** (e.g., `tenant:delete`,
  `tenant:transfer`). Otherwise a future PR silently escalates admin
  power.
- **Action names MUST NOT contain `:`.** If permissions are ever
  serialised as `resource:action` strings (a common pattern), names
  like `staff:role:create` become ambiguous. Use `staff:roleCreate`.

### Barrel

- **`src/index.ts` is the only public surface.** Apps import from
  `@resto/domain`, never from `@resto/domain/src/...`. The barrel
  re-exports both the value (Zod schema) and the type (`z.infer`) — TS
  namespace merging propagates both through a single `export { Foo }
from './foo'`.

## Tests

- **Every value-object schema has a property test.** Accept happy cases,
  reject every documented invalidity. Slug, currency, money, locale,
  URL — these are the rules every consumer relies on.
- **An "import boundary" test asserts the resolved module graph has
  zero infra packages.** Catches accidental `import` of `drizzle-orm`
  or `@nestjs/common` before it merges.
