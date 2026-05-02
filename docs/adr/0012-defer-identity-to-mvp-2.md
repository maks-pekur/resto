# ADR 0012: Defer the identity provider to MVP-2

- **Status:** superseded by [ADR 0013](./0013-better-auth-for-mvp2-identity.md)
- **Date:** 2026-05-01
- **Supersedes:** [ADR 0005](./0005-keycloak-self-hosted-identity.md)
- **Deciders:** Resto core team

## Context

ADR-0005 picked self-hosted Keycloak as the identity provider for the
platform. That decision still holds long-term — Resto needs an OIDC/
OAuth2 IdP, multi-tenant role and attribute model, MFA, etc.

What changed is the MVP-1 scope (ADR-0010). MVP-1 ships:

- A public, customer-facing read path (`GET /v1/menu`, `GET
/v1/menu/items/:id`) consumed by the QR-menu and resolved by tenant
  subdomain. **No end-user authentication.**
- An internal write path (`POST /internal/v1/*`) used **only** by the
  operator-run seed CLI to onboard design partners. **No admin UI.**

For both surfaces, Keycloak buys nothing in MVP-1:

- The customer surface is anonymous by design.
- The internal surface has exactly one caller (us, on a laptop). A
  shared secret (`INTERNAL_API_TOKEN`) gives strictly stronger
  guarantees per operator-hour than a Keycloak user with the same
  realm role would, because the deployment surface is smaller and the
  rotation story is simpler.

Meanwhile Keycloak imposes meaningful operational weight even in dev:
two extra Postgres databases, a JVM container, a realm-seed script that
must stay in sync with the api's role catalogue, password-grant flows
in the seed CLI, JWKS rotation handling in the api, a guard/roles/
principal projection layer end-to-end, e2e overrides for a fake JWT
verifier, etc. Each of those was complexity the team carried without
ever exercising the resulting capability.

## Decision

Remove Keycloak from MVP-1 entirely. Auth in MVP-1 is:

- **Public read path:** unauthenticated. Tenant context comes from the
  request host via `TenantContextMiddleware`.
- **Internal write path:** `INTERNAL_API_TOKEN` shared secret enforced
  by `InternalTokenGuard`. The seed CLI sends the same token.

The identity layer (the previous `apps/api/src/contexts/identity/`
context, the Keycloak admin client, the realm-seed script, the
password-grant code path in the seed CLI) is deleted, not stubbed.

When MVP-2 adds the admin UI we will re-introduce a real IdP. ADR-0005's
analysis of providers (Keycloak vs Ory vs FusionAuth vs managed) still
applies; that decision will be re-opened or re-affirmed at the time,
not pre-baked now.

## Alternatives considered

- **Keep Keycloak running but stop calling it.** Rejected: paying the
  operational cost (containers, env vars, dev stack startup time, seed
  scripts that drift) for code paths that are not exercised is exactly
  the failure mode this ADR exists to fix.
- **Replace Keycloak with a smaller IdP (e.g., Hanko, Ory Kratos).**
  Rejected: same shape of problem at smaller scale. MVP-1 has no end
  users, so any IdP at all is overhead until MVP-2.
- **Hand-rolled JWTs signed by the api itself.** Rejected: one of
  ADR-0005's bright lines — "identity is too important to roll your
  own." We are not crossing it. When real IAM is needed, we revisit
  ADR-0005's matrix.
- **No internal-write auth at all in dev.** Rejected: the internal
  surface mutates tenant data and must reject default-deny on
  unauthenticated callers even in dev, so the same code path runs in
  prod with a strong secret.

## Consequences

### Positive

- Local dev stack is smaller (`docker compose up` no longer starts a
  JVM, Keycloak Postgres, or runs realm seed). Cold-start time drops.
- The api boot path stops loading an `IdentityModule`, JWKS verifier,
  and roles guard layer that no MVP-1 endpoint exercises.
- The seed CLI is a thin shell over `/internal/v1/*` — no
  password-grant flow, no Keycloak admin REST client.
- Far fewer moving parts to explain, reason about, or break while
  shipping the rest of MVP-1.

### Negative

- We will do this work twice: a real IdP comes back in MVP-2 with the
  admin UI. Some of the deleted code (principal projection,
  `@CurrentUser` decorator) will have analogues again — but those
  analogues should be designed against the actual MVP-2 requirements,
  not the speculative ones we baked in here.
- The internal surface's only protection is a shared secret. Anyone
  who exfiltrates `INTERNAL_API_TOKEN` from the operator's environment
  can mutate every tenant. Mitigation: the token rotates per
  environment via Vault / 1Password Connect (no plaintext in repo);
  the surface is internal-only and not exposed at the edge.

### Neutral

- ADR-0010's "MVP-1 scope" originally listed identity as one of the
  four bounded contexts. The scope still holds at the product level —
  we're just deferring the implementation to MVP-2 where it pays off.

## Implementation notes

- Removed: `apps/api/src/contexts/identity/`,
  `tools/scripts/keycloak-seed.mjs`, `tools/scripts/seed/lib/keycloak-admin.ts`,
  `tools/scripts/seed/commands/rotate-tenant-credentials.ts`, all
  `KEYCLOAK_*` env vars, the Keycloak service block in
  `docker-compose.dev.yml`.
- Reused: `InternalTokenGuard` and `INTERNAL_API_TOKEN` from RES-78
  cover the internal write surface.
- The MVP-2 admin UI ticket will re-open ADR-0005 with the live
  requirements at that point.
