# ADR 0005: Self-hosted Keycloak as the identity provider

- **Status:** accepted
- **Date:** 2026-04-30
- **Deciders:** Resto core team

## Context

Resto needs an OIDC/OAuth2 identity provider that supports:

- Multi-tenancy: realms or organizations per tenant, or per-tenant
  branding within a single realm.
- RBAC + ABAC: roles per tenant (owner, manager, kitchen, waiter, ...)
  plus attribute-based rules (e.g. access only to a specific restaurant
  inside a multi-location tenant).
- MFA, social login, magic link, password policies.
- API keys for tenant integrations.
- Self-hosting and full ownership of credentials.

## Decision

Use **self-hosted Keycloak** (latest stable, in HA configuration once we
go to production) as the identity provider. Tenants are modeled as
Keycloak organizations within a single realm; per-tenant branding via
realm/organization settings or a thin BFF layer.

## Alternatives considered

- **Ory** (Hydra + Kratos + Keto + Oathkeeper). Strongest argument:
  modular, cloud-native, each component focused. Rejected: operational
  surface is wider (4+ services), we'd build more of the admin/UX
  glue ourselves; Keycloak ships a complete admin UI that saves
  meaningful time for a small team without sacrificing self-hosting.
- **Auth0 / Clerk / WorkOS** (managed). Strongest argument: dramatically
  faster setup, polished UX. Rejected: vendor lock-in on a load-bearing
  surface, per-MAU pricing scales painfully, customization limits will
  bite once tenant requirements get specific.
- **FusionAuth** (self-hosted, free tier). Strongest argument: similar
  shape to Keycloak with a friendlier admin UX. Rejected: smaller
  community, less battle-tested at the scale we plan for; Keycloak's
  ecosystem advantage is decisive.
- **Build it ourselves.** Rejected outright. Identity is too important
  to roll your own crypto.

## Consequences

### Positive

- Full control of credentials, no per-MAU fees, no vendor lock-in.
- Mature OIDC/OAuth2 support, rich RBAC and attribute model.
- Built-in admin UI accelerates ops.
- Token format is standard JWT — every Resto service validates
  upstream-issued tokens identically.

### Negative

- We operate it. Backup, upgrade, HA, performance tuning are on us.
- Customizing the login UX beyond theming requires custom SPI extensions
  (Java) or a BFF that proxies the flow.
- Realm/organization data model has sharp edges; we will document them
  in `docs/identity-model.md` once finalized.

### Neutral

- Tokens are short-lived JWTs with refresh-token rotation. Resto API
  validates locally via JWKS; no per-request introspection round trip
  in the hot path.

## Implementation notes

- Local dev: Keycloak runs in `infra/docker/docker-compose.dev.yml` with
  a pre-seeded realm and test users (seed scripts in `tools/scripts/`).
- Production: deploy via Helm chart with managed Postgres backend and
  HA replica count. State backup is Postgres backup; no special path.
- Tenant resolution: subdomain → tenant id (Keycloak organization id)
  → token request scoped to that organization.
