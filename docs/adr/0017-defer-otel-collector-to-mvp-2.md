# ADR 0017: Defer OTel collector deployment to MVP-2

- **Status:** accepted
- **Date:** 2026-05-07
- **Deciders:** Resto core team
- **Supersedes:** —
- **Superseded by:** —

## Context

ADR-0008 commits to OpenTelemetry + Grafana stack (Tempo / Loki /
Prometheus) as the observability pipeline. The SDK is wired in every app
via `bootstrap-telemetry.ts` and exports OTLP to
`OTEL_EXPORTER_OTLP_ENDPOINT`. In MVP-1 there is no collector running in
any non-dev environment: the api emits traces into the void, pays the
SDK CPU and memory cost, and risks blocking startup on a non-existent
endpoint.

ADR-0011 names AWS (EKS + Managed Grafana / CloudWatch) as the prod
hosting target, but the cluster, collector DaemonSet, and Grafana stack
are not yet provisioned (tracked in RES-118 / RES-85 / RES-86 and the
parent k8s umbrella). MVP-1's surface (tenancy, identity, catalog,
qr-menu) does not block on observability — the stack is a phase-2
investment.

## Decision

The OTel SDK is opt-out via `OTEL_DISABLED=true`. Local development
keeps it on (Jaeger ships in `infra/docker/docker-compose.dev.yml`).
Staging and production set `OTEL_DISABLED=true` until the collector and
Grafana stack are deployed in MVP-2. `bootstrap-telemetry.ts` logs the
selected mode at startup so the operating environment is visible from
the first log line.

## Alternatives considered

- **Deploy the full Grafana stack now.** Strongest argument: ADR-0008
  is already accepted and implementing on-time avoids a second pass.
  Rejected: requires the EKS cluster (RES-118 parent), Helm charts,
  Vault wiring for credentials, and a minimum two-week effort that is
  not on the MVP-1 critical path.
- **Hard-code the SDK off and rip out the OTel imports.** Strongest
  argument: simpler code, no dead exporter. Rejected: re-enabling later
  requires re-instrumentation; flag-gated boot is one line of diff
  difference and keeps every app's instrumentation contracts intact.
- **Run a no-op exporter in MVP-1.** Strongest argument: developers see
  identical behaviour locally and in staging. Rejected: still pays SDK
  cost, still pollutes logs with exporter retry noise.

## Consequences

### Positive

- Zero-cost telemetry in MVP-1 environments where there is no backend
  to receive it.
- Boot-time log line states the chosen mode unambiguously, removing the
  "is OTel actually working?" question.
- ADR-0008's design stands; only the deployment timing changes.

### Negative

- Staging and production lose tracing during MVP-1. Mitigated by
  structured stdout logs (Pino) and Sentry error tracking, which we
  already have.
- The flag adds one branch in `bootstrap-telemetry.ts`. Trivial.

### Neutral

- The dev-stack Jaeger keeps working without configuration changes.
- ADR-0008's instrumentation contracts (resource attributes, span
  conventions) are unchanged.

## Implementation notes

- `apps/api/src/bootstrap-telemetry.ts` reads `OTEL_DISABLED` from
  `process.env` directly (it runs before the Nest container).
- `.env.example` ships with `OTEL_DISABLED=false` for local dev.
- Re-enabling on a per-environment basis is a single env flip; the
  follow-up that wires the collector is tracked under RES-118 / RES-101.
