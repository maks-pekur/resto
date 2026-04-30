# apps/

## Purpose

Deployable applications. Each subdirectory is an independently buildable and
deployable artifact. Apps depend on `packages/*` for shared code; apps must
not depend on each other.

## Layout

- `api/` — NestJS modular monolith (single deployable bundling all bounded
  contexts: identity, tenancy, catalog, ordering, payments, reservations,
  loyalty, inventory, analytics, notifications, audit). Will gain a child
  CLAUDE.md once scaffolded.
- `admin/` — Next.js 15 (App Router, RSC) admin panel for tenant operators.
- `website/` — Next.js tenant marketing sites (multi-tenant SSR; one Next
  app serves all tenants via host-based routing).
- `qr-menu/` — Vite + React; customer-facing menu accessed by QR code at the
  table. Optimized for cold-start speed on mobile networks.
- `mobile/` — Expo (React Native) customer app.
- `landing/` — Marketing site for the SaaS itself (not a tenant site).

## Rules

- Apps only import from `@resto/*` packages, never reach into another app's
  source.
- Every app has its own `eslint.config.mjs`, `tsconfig.json`, `project.json`
  (Nx).
- Infra concerns (DB connection, Redis, NATS, Keycloak) come from
  `packages/db` and equivalent — apps wire them at the composition root only.
- New app → add a child `CLAUDE.md` here only if it deviates from these
  defaults.
