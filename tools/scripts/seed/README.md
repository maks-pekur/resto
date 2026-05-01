# resto-seed CLI

Operator CLI used by the Resto team to onboard design-partner
restaurants until the admin UI ships in MVP-2. Runs against a live
Resto api + Keycloak — there is no offline mode.

## Prerequisites

1. Resto api reachable at `RESTO_API_URL` (default `http://localhost:3000`).
2. Keycloak reachable at `KEYCLOAK_ADMIN_URL` (default `http://localhost:8080`).
3. Required env vars in your shell:
   - `INTERNAL_API_TOKEN` — same shared secret the api accepts on
     `/internal/v1/*` (RES-78). In dev, set it on the api before
     calling the CLI.
   - `KEYCLOAK_ADMIN_PASSWORD` — master-realm admin password.
4. Optional: `KEYCLOAK_ADMIN` (default `admin`), `KEYCLOAK_REALM`
   (default `resto`).

## Commands

All commands accept `--dry-run` and `--help`. All commands are
**idempotent** — re-running a `provision-tenant` against an already-
provisioned slug is a no-op.

### `provision-tenant`

```bash
pnpm resto:seed provision-tenant \
  --slug cafe-roma \
  --name "Cafe Roma" \
  --owner-email owner@cafe-roma.test \
  --initial-password "$(openssl rand -base64 24)" \
  --currency USD
```

Creates the tenant row + the auto subdomain in the api, then ensures
the realm roles + the owner user in Keycloak. The owner password is
marked **temporary** — they reset it on first login. The CLI logs the
new tenant id and Keycloak subject as JSON to stdout.

### `seed-menu`

```bash
pnpm resto:seed seed-menu \
  --tenant cafe-roma \
  --file menus/cafe-roma.yaml \
  --owner-email owner@cafe-roma.test \
  --owner-password '<one-time password printed by provision-tenant>' \
  --client-id resto-api \
  --client-secret '<from Keycloak>'
```

Validates the YAML against `@resto/domain` Zod schemas (currency,
slug, money, localized text), then upserts categories → items →
modifiers and finally calls `POST /internal/v1/catalog/publish`. The
write endpoints require the owner's bearer token, obtained via the
Keycloak password grant — `seed-menu` runs the grant for you using the
flags you pass.

### `rotate-tenant-credentials`

```bash
pnpm resto:seed rotate-tenant-credentials \
  --tenant cafe-roma \
  --owner-email owner@cafe-roma.test \
  --new-password '<new pw>'
```

Resets the owner's password and force-logs-out their active sessions.
Use after offboarding an operator or in an incident response.

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
- **`seed-menu` returns 403** — owner credentials don't have the
  `owner` role, or the token's `tenant_id` claim does not match the
  resolved subdomain (RES-79's cross-tenant guard fired).
- **`Token grant failed`** — Keycloak rejected the password grant.
  Verify the client is confidential, that direct-access grants are
  enabled, and that the client secret matches.

## Recovery

The CLI is idempotent. If a run fails partway through:

1. Read the structured error and fix the cause.
2. Re-run the **same command** — already-applied state is detected and
   skipped, never duplicated.
3. If you need to start clean in dev, `pnpm dev:reset` wipes Postgres
   and Keycloak's data volumes; `pnpm dev:keycloak-seed` re-seeds the
   dev realm.

## CI smoke test

A smoke test (deferred — see RES-81 PR notes) provisions a fixture
tenant + seeds a fixture menu against ephemeral Postgres + Keycloak,
then asserts `GET /v1/menu` against the tenant's host returns the
seeded items. Until that lands, run `tools/scripts/seed/test/` locally
against the dev stack as a release-readiness check.
