# Resto

Multi-tenant SaaS platform for the restaurant industry. A single tenant
provisions an admin panel, a public marketing website, a QR-menu, and a
customer-facing mobile app, all driven by a shared backend platform.

## Stack

- **Backend:** NestJS (modular monolith with DDD bounded contexts) + Drizzle
  ORM + PostgreSQL 16 with Row-Level Security + Redis + NATS JetStream
- **Identity:** Better Auth (in-process, see
  [ADR-0013](./docs/adr/0013-better-auth-for-mvp2-identity.md)) lands with
  MVP-2; MVP-1 internal endpoints use a shared `INTERNAL_API_TOKEN` and
  customer reads are public
- **Frontend:** Next.js 15 (App Router, RSC) for admin & tenant websites,
  Vite + React for the QR-menu, React Native (Expo) for mobile
- **Monorepo:** Nx + pnpm workspaces
- **Observability:** OpenTelemetry into the Grafana stack (Tempo, Loki,
  Prometheus) plus Sentry for errors
- **Infrastructure:** Docker Compose (dev), AWS EKS + RDS + S3 +
  ElastiCache via Terraform (staging/prod, see
  [ADR-0011](./docs/adr/0011-hosting-on-aws.md))

See [`docs/adr/`](./docs/adr/) for the rationale behind each major decision.

## Layout

```
apps/         → deployable applications (api, admin, website, qr-menu, mobile, landing)
packages/     → shared libraries (domain, ui, api-client, db, events, configs, ...)
infra/        → IaC, Docker, Kubernetes manifests
docs/         → architecture decision records, API docs
tools/        → workspace tooling and codemods
```

## Getting started

### Requirements

- Node.js ≥ 22 (use `nvm use` / `fnm use`)
- pnpm ≥ 9 (provided via `corepack enable`)
- Docker Desktop or OrbStack

### Bootstrap

```bash
corepack enable
pnpm install
pnpm dev:up        # start postgres, redis, nats, minio, mailhog, jaeger
```

### Common commands

```bash
pnpm lint          # lint affected projects
pnpm typecheck     # typecheck affected projects
pnpm test          # run tests for affected projects
pnpm build         # build all projects (cached)
pnpm format        # write Prettier formatting
pnpm dev:down      # stop dev services
pnpm dev:reset     # stop dev services and wipe their volumes
```

## Architecture

This is a modular monolith with cleanly separated bounded contexts. Read
the ADRs in [`docs/adr/`](./docs/adr/) for the architectural choices and
their rationale, starting with `0001-modular-monolith-with-ddd.md`.

## Conventions

- Conventional Commits with optional `RES-<n>:` ticket prefix
- Trunk-based development with feature flags
- ADRs are immutable once accepted; supersede with a new ADR rather than
  editing
