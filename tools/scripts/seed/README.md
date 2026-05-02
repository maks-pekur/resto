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
  --currency USD
```

Creates the tenant row + the auto subdomain in the api. Logs the
new tenant id as JSON to stdout.

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
