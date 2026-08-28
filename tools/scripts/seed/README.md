# resto-seed CLI

Operator CLI used by the Resto team to onboard design-partner
restaurants until the admin UI ships in MVP-2. Calls the api's
`/internal/v1/*` surface authenticated by the shared
`INTERNAL_API_TOKEN` (see ADR-0012). There is no offline mode.

## Prerequisites

1. Resto api reachable at `RESTO_API_URL` (default `http://localhost:3000`).
2. `INTERNAL_API_TOKEN` env var — same shared secret the api enforces
   on `/internal/v1/*` (RES-78).

## Commands

All commands accept `--dry-run` and `--help`. All commands are
**idempotent** — re-running a `provision-tenant` against an already-
provisioned slug is a no-op.

### `provision-tenant`

```bash
pnpm resto:seed provision-tenant \
  --slug cafe-roma \
  --name "Cafe Roma" \
  --country GB
```

Creates the tenant row + the auto subdomain in the api. `--country` is
required — one of `UA`, `GB`, `ES` — and the currency is derived from it
(never accepted as an input, D-35). Logs the new tenant id as JSON to
stdout.

### `seed-demo`

```bash
NODE_ENV=development BETTER_AUTH_DATABASE_URL=... pnpm resto:seed seed-demo
```

Dev-only fixture (refuses outside `NODE_ENV=development`). Idempotently
provisions 3 tenants — one per supported country (`pizza`/UA,
`burger`/GB, `tapas`/ES) — each with its own locations and catalog, one
owner (`owner@demo.local`) belonging to all three, and two staff accounts
each scoped to a single tenant. The first tenant also gets a
handful of demo orders across the order lifecycle. Credentials are printed
to stdout at the end — not persisted anywhere.

#### `--refresh-photos`

Menu photos are uploaded once and reused on every later run, so a re-seed does
not re-download a dozen images. Pass `--refresh-photos` after changing a source
URL or the image pipeline to pull and re-cut them all.

Photos are normalised on the way in: the studio background is made transparent
(a white ground renders as a white rectangle on a dark menu), the longest side is
capped at 900px, and the result is stored as WebP.

#### `--payments-ready`

```bash
NODE_ENV=development SEED_STRIPE_TEST_ACCOUNT_ID=acct_xxx \
  pnpm resto:seed seed-demo --payments-ready
```

Makes the `pizza` tenant (only — `burger` and `tapas` are
deliberately left without payments, so `payments.not_enabled` stays
visible) able to take a real Stripe test-mode payment. Refused outside
`NODE_ENV ∈ {development, test}` (allowlist, matching the
`assertProdGuardrails`/`db:reset` precedent).

The seed cannot fabricate a working connected account: the payments module
always calls the real Stripe SDK, and Express accounts can only accept
Stripe's Terms of Service through Stripe's own hosted onboarding form —
that one step cannot be scripted. `SEED_STRIPE_TEST_ACCOUNT_ID` must be a
real Stripe **test-mode** connected account id (`acct_...`) that already
exists under your Stripe account. Get one once:

1. Run the seed without `--payments-ready` and sign in as
   `owner@demo.local` at the admin URL printed in the credentials block.
2. Start Stripe Connect onboarding for `pizza` from the admin UI (or call
   `POST /v1/tenancy/onboarding/account-link` directly) and complete the
   Stripe-hosted form once, in **test mode** — Stripe's test mode has a
   one-click "skip and use test data" shortcut, no real business details
   needed.
3. Read the resulting id back: `SELECT stripe_account_id FROM tenants
WHERE slug = 'pizza';`, or from the Stripe test-mode dashboard under
   Connect → Accounts.
4. Re-run the seed with `--payments-ready` and that id — every future
   `--payments-ready` run reuses the same id, so this manual step is
   one-time per Stripe test account, not per seed run.

If `SEED_STRIPE_TEST_ACCOUNT_ID` is unset, the command fails immediately
with instructions matching the above, before any tenant is provisioned.

### `seed-menu`

```bash
pnpm resto:seed seed-menu \
  --tenant cafe-roma \
  --file menus/cafe-roma.yaml
```

Validates the YAML against `@resto/domain` Zod schemas (currency,
slug, money, localized text), then upserts categories → items →
modifiers and finally calls `POST /internal/v1/catalog/publish`.
Calls go to `/internal/v1/*` with the shared internal token; the
api resolves the tenant from `--tenant` via the `X-Tenant-Slug`
header.

## Menu YAML shape

```yaml
currency: USD

categories:
  - slug: pizza
    name: { en: Pizza, ru: Пицца }
    sortOrder: 0

items:
  - slug: margherita
    category: pizza
    name: { en: Margherita }
    description: { en: Tomato, mozzarella, basil }
    basePrice: '12.50'
    status: published
    sortOrder: 0
    variants:
      - name: { en: Large }
        priceDelta: '2.50'
        isDefault: false

modifiers:
  - slug: toppings
    name: { en: Toppings }
    minSelectable: 0
    maxSelectable: 3
    isRequired: false
```

Money is **always** a decimal string (`'12.50'`) — never a float. Slugs
are lowercase ASCII. Localized text is a `{ <locale>: <string> }` map
matching the BCP-47-ish form `en` or `en-US`.

A malformed YAML fails up front with a Zod issue list pointing at the
exact path; nothing is written to the api in that case.

## Common errors

- **`MissingEnvError: INTERNAL_API_TOKEN`** — set the env var; same
  value the api enforces on `/internal/v1/*`.
- **`provision-tenant` returns 401** — `INTERNAL_API_TOKEN` mismatch
  between the CLI and the api.
- **`seed-menu` returns 404** — tenant slug does not exist; run
  `provision-tenant` first.

## Recovery

The CLI is idempotent. If a run fails partway through:

1. Read the structured error and fix the cause.
2. Re-run the **same command** — already-applied state is detected and
   skipped, never duplicated.
3. If you need to start clean in dev, `pnpm dev:reset` wipes Postgres.

## CI smoke test

A smoke test (deferred — see RES-81 PR notes) provisions a fixture
tenant + seeds a fixture menu against ephemeral Postgres, then asserts
`GET /v1/menu` against the tenant's host returns the seeded items.
Until that lands, run `tools/scripts/seed/test/` locally against the
dev stack as a release-readiness check.
