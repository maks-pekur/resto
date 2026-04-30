# ADR 0008: OpenTelemetry + Grafana stack + Sentry for observability

- **Status:** accepted
- **Date:** 2026-04-30
- **Deciders:** Resto core team

## Context

A serious multi-tenant platform must ship with observability from day
one, not as a phase-2 add-on. We need traces, metrics, logs, and error
tracking, with correlation across them and per-tenant filtering.

## Decision

- **Instrumentation:** OpenTelemetry SDK across all apps (backend,
  Next.js servers, mobile via the Expo OpenTelemetry packages).
- **Pipeline:** OTLP via the OpenTelemetry Collector.
- **Backends:** Tempo (traces), Loki (logs), Prometheus (metrics).
  Hosted as the open-source Grafana stack (self-hosted) or Grafana
  Cloud — choice deferred until the hosting target is decided.
- **Errors:** Sentry (self-hosted or SaaS — also deferred).
- **Standard tags on every signal:** `tenant.id`, `service.name`,
  `service.version`, `deployment.environment`, plus a request
  `correlation_id` propagated end-to-end.

## Alternatives considered

- **Datadog.** Strongest argument: best-in-class UX, integrated. Rejected:
  cost at scale, vendor lock-in on a load-bearing surface, and our
  self-hosting stance.
- **New Relic.** Similar tradeoffs to Datadog.
- **Roll our own metrics + logs + nothing else.** Rejected: no traces
  means we cannot debug distributed flows once contexts split out, and
  even within the monolith we benefit from cross-context spans.

## Consequences

### Positive

- Vendor-neutral instrumentation; we can swap backends without
  re-instrumenting.
- Per-tenant filters in Grafana let support and engineering scope
  investigations cleanly.
- Errors in Sentry link back to traces in Tempo via trace id.

### Negative

- Operating the Grafana stack ourselves adds infra. We accept this in
  exchange for cost control and ownership.
- Discipline required: every cross-cutting layer (HTTP, DB, queue
  consumer) must propagate the trace context. We enforce via shared
  middleware in `packages/`.

### Neutral

- OpenTelemetry semantic conventions evolve; we pin SDK versions and
  bump them deliberately.

## Implementation notes

- Local dev: Jaeger UI (in `infra/docker/docker-compose.dev.yml`)
  receives OTLP traces directly during development. Logs go to stdout
  with structured JSON; we will not run Loki locally to keep the dev
  stack lean.
- Each app exports a single `bootstrap-telemetry.ts` module imported
  before any framework code; it sets up the OTLP exporter and
  resource attributes.
- Sampling: head-based 10% in prod plus tail-based for error/slow
  traces (configured at the Collector).
- Sensitive fields (PII, payment data) are stripped via a span
  processor; we maintain an explicit allowlist of attributes that may
  carry tenant content.
