# Resto

## Purpose

Multi-tenant SaaS platform for the restaurant business. A single tenant
operates an admin panel, a public marketing site, a QR-menu, and a customer
mobile app — all powered by a shared backend.

## Layout

- [`apps/`](./apps/CLAUDE.md) — deployable applications (api, admin, website,
  qr-menu, mobile, landing).
- [`packages/`](./packages/CLAUDE.md) — shared libraries (domain, ui,
  api-client, db, events, configs).
- [`infra/`](./infra/CLAUDE.md) — Docker (dev), Kubernetes manifests,
  Terraform/Pulumi IaC.
- [`docs/`](./docs/CLAUDE.md) — Architecture Decision Records and API docs.
- `tools/` — workspace tooling, codemods, scripts.

## Stack

- **Backend:** NestJS (modular monolith with DDD) + Drizzle ORM + PostgreSQL
  16 with Row-Level Security + Redis + NATS JetStream
- **Identity:** Self-hosted Keycloak (OIDC/OAuth2) with RBAC + ABAC
- **Frontend:** Next.js 15 (App Router, RSC) for admin and tenant websites,
  Vite + React for the QR-menu, React Native (Expo) for mobile
- **Monorepo:** Nx 20 + pnpm 9 workspaces
- **Observability:** OpenTelemetry → Tempo (traces), Loki (logs), Prometheus
  (metrics) + Sentry
- **Node:** v22 LTS (see `.nvmrc`); pnpm via Corepack

See `docs/adr/` for the rationale behind each major decision. ADRs are
authoritative — when conflicting with this file, the ADR wins.

## Workflows

- `pnpm dev:up` — start local stack (Postgres, Redis, NATS, Keycloak, MinIO,
  MailHog, Jaeger).
- `pnpm dev:down` / `pnpm dev:reset` — stop / wipe-volumes.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` — all run via Nx
  with affected/cache.
- Trunk-based: branch from `main`, PR back to `main`. No long-lived branches.
- Conventional Commits required (commitlint enforces). Optional `RES-<n>:`
  ticket prefix per global `~/.claude/CLAUDE.md`.
- Feature flags (OpenFeature) gate every non-trivial change in production.

## Gotchas

- **Nothing in the domain layer talks to infrastructure directly.** Use
  ports (interfaces in `application/`) implemented by adapters in
  `infrastructure/`. The domain must remain framework-agnostic.
- **Tenant context is propagated via AsyncLocalStorage**, not function
  arguments. Every repository read/write must filter by tenant; Postgres RLS
  is the second line of defense, not the first.
- **No dual writes** between Postgres and the event bus. Use the outbox
  pattern (`packages/events`) — outbox table + dispatcher to NATS.
- **No raw SQL outside `packages/db`** (Drizzle migrations and explicit
  type-safe queries only).
- **Cross-context calls go through application services**, not direct
  domain imports. Keep bounded contexts truly isolated even inside the
  monolith — this is what makes future extraction cheap.
- **`api/` at the workspace root is reserved**: the NestJS app lives at
  `apps/api/`. Don't recreate the legacy top-level `api/` folder.

## MCP

- Use **Linear** for ticket lookups when a `RES-<n>` reference appears.
- Use **Context7** for current library/CLI documentation (NestJS, Drizzle,
  Nx, Keycloak, Next.js, Expo, etc.) before relying on training-data
  knowledge.
- Use **Cloudflare** MCP only if/when we adopt their edge for tenant
  domains; not in scope yet.

## Rules

- **Never** introduce a BaaS/serverless shortcut (Supabase, Firebase, Auth0)
  in place of the agreed self-hosted/custom stack.
- **Never** mix tenant data — every domain table has a `tenant_id` and a
  Drizzle helper enforces it; raw bypass is a CI failure.
- **Never** commit secrets. Use `.env.example` for shape, real values come
  from Vault / 1Password Connect.
- **Always** add an ADR before introducing a new piece of infrastructure
  (a new data store, a new external service, a new framework).
- **Always** generate API clients from OpenAPI; never hand-write request
  shapes that already exist in the contract.
- **Always** treat the domain package as the single source of truth for
  business types — UIs and integrations import from `@resto/domain`.
