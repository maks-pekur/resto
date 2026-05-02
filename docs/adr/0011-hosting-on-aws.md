# ADR 0011: Hosting on AWS (EKS + RDS + S3 + ElastiCache, eu-central-1)

- **Status:** accepted
- **Date:** 2026-05-02
- **Deciders:** Resto core team
- **Supersedes:** —
- **Superseded by:** —

## Context

ADR-0006 (multi-tenancy) and ADR-0008 (observability) both punted the
hosting target with a "decide later" note. The deferral has now started
to load-bearing-block real work:

- RES-83 / RES-85 — production Terraform + Helm chart for the two-role
  Postgres needs to know which managed-Postgres flavor it is targeting
  (different providers expose different superuser semantics).
- ADR-0008 left Tempo / Loki / Sentry "self-hosted vs SaaS" open.
- The api Dockerfile (RES-77) ships an alpine image and explicitly
  defers `gcr.io/distroless/nodejs22-debian12` until the prod platform
  is decided.

Picking the platform unblocks all three.

The forces in play:

- **JS/TS-only stack** — every app is Node-based. We need a runtime
  that runs long-lived stateful processes (NestJS+Fastify on the api,
  NATS subscribers).
- **Multi-tenant SaaS for restaurants** — most early tenants will be
  in EU; data residency lands on the radar for any GDPR-conscious
  tenant onboarding.
- **Modular monolith with a future-extraction path** — we need to be
  able to graduate one bounded context into its own deployable later
  without rewriting the platform. That argues for K8s over PaaS.
- **Tiny ops team** — managed services beat self-hosted whenever the
  managed offering meets the spec. We will not run our own Postgres
  or our own Redis cluster.

## Decision

Host Resto on **AWS** in **eu-central-1** (Frankfurt), using these
managed services:

| Concern              | Service                                                                                                                                  |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Compute              | **EKS** (managed Kubernetes)                                                                                                             |
| Application database | **RDS for PostgreSQL 16**                                                                                                                |
| Object storage       | **S3** (already aligned via `@aws-sdk`)                                                                                                  |
| Cache                | **ElastiCache Redis**                                                                                                                    |
| Event bus (broker)   | **NATS JetStream** self-hosted on EKS                                                                                                    |
| Identity provider    | **Keycloak** self-hosted on EKS                                                                                                          |
| Secrets              | **AWS Secrets Manager** via IRSA                                                                                                         |
| Container registry   | **ECR**                                                                                                                                  |
| Edge / DNS           | **CloudFront + Route 53**                                                                                                                |
| Load balancing       | **ALB** for the api, **CloudFront** for qr-menu                                                                                          |
| Observability        | OTLP → **AWS Distro for OpenTelemetry** collector → CloudWatch (storage) + **AWS Managed Grafana** (dashboards). Sentry SaaS for errors. |
| IaC                  | **Terraform**                                                                                                                            |

Region choice — **eu-central-1**. Resto's first design-partner tenants
are Polish/Ukrainian/EU restaurants; same-region p95 to the qr-menu
matters for the LCP < 1.5s budget (RES-82). A second region (likely
us-east-1) lands when the first non-EU tenant signs.

## Alternatives considered

### Hetzner managed Kubernetes + Hetzner Cloud Postgres

**Strongest argument:** dramatically cheaper. A comparable EKS + RDS
baseline runs ~$300–500/month before traffic; the Hetzner equivalent
is closer to $70/month. Excellent EU presence (Falkenstein, Helsinki).

**Rejected because:** Hetzner managed Postgres is young (GA 2024) and
its `BYPASSRLS` semantics around the bootstrap user are less battle-
tested than RDS — a load-bearing detail for our two-role connection
pattern (RES-83). No native equivalent of IRSA / Secrets Manager
forces us to roll secrets ourselves. Reasonable choice if cost
dominates; rejected because we want the managed-services breadth more
than the cost saving at our scale.

### DigitalOcean App Platform + Managed Postgres

**Strongest argument:** the simplest ops experience of any cloud. A
team-of-one can run production. Good enough for many SaaS at this
stage.

**Rejected because:** App Platform is PaaS, not K8s — no clean
graduation path to per-context deployables without re-platforming.
The managed Postgres tier does not expose the role-attribute knobs
RES-83 needs.

### GCP GKE + Cloud SQL + GCS

**Strongest argument:** GKE is widely considered the best-managed
Kubernetes among the big three. Workload Identity is more ergonomic
than IRSA. Good observability story (Cloud Trace integrates with
OTel out of the box).

**Rejected because:** rough parity with AWS on the technical side, and
AWS won on familiarity and ecosystem breadth (Stripe, third-party
integrations) for our team. A reasonable swap target if AWS
operational pain drives a re-decision.

### Cloudflare Workers + R2 + D1 / Hyperdrive

**Strongest argument:** edge-first, cheapest at low traffic, the qr-
menu LCP would be excellent globally with zero region planning.

**Rejected because:** the api is a stateful NestJS+Fastify long-lived
process; workers are not the right shape for it. Splitting (workers
for the qr-menu read path, EKS for the api) is plausible but adds two
deployment models for one MVP. Defer to a later optimization if
qr-menu p95 outside EU becomes a real complaint.

## Consequences

### Positive

- **Two-role Postgres (RES-83) becomes deterministic.** RDS
  `rds_superuser` semantics are documented and stable; the runbook in
  `docs/runbooks/database-roles.md` already enumerates the AWS RDS
  case as "works as-is".
- **Secrets stop being an open question.** Vault / 1Password Connect
  references in env / runbooks become AWS Secrets Manager + IRSA.
- **Observability backends decided.** ADR-0008's "deferred until
  hosting" line is closed: Tempo/Loki collapses to CloudWatch + AWS
  Managed Grafana; Sentry stays SaaS.
- **S3-compatible storage choice (RES-92) needs no change.** The
  presigned-URL adapter already speaks S3; we drop MinIO in
  production.
- **Distroless image (RES-86) unblocks.** ECR + EKS happily run
  `gcr.io/distroless/nodejs22-debian12` — that ticket can pick up.

### Negative

- **Cost.** EKS control plane ($72/month) + RDS Multi-AZ + ALB +
  ElastiCache + NLB + traffic puts the floor near $400/month before
  any tenant signs. A small price for a B2B SaaS, but real on day 0.
- **Vendor lock-in.** IRSA, Secrets Manager, and ALB ingress are
  AWS-specific. Mitigated by keeping the Helm charts portable; only
  the Terraform layer is AWS-only. A move off would mean rewriting
  ~30% of the IaC.
- **Operational surface.** EKS is more complex than App Platform.
  Mitigated by leaning on AWS-managed everything for stateful tiers
  (RDS, ElastiCache) so the cluster only runs stateless workloads
  - NATS + Keycloak.

### Neutral

- **Single region day 0.** Multi-region is a future ADR; eu-central-1
  is the first region.
- **NATS and Keycloak self-hosted on EKS.** Per ADR-0004 and ADR-0005
  the broker and IdP were always going to be self-hosted; AWS does
  not change that.
- **Container builds in CI push to ECR.** The image-build pipeline is
  the same shape for any cloud; only the registry credentials differ.

## Implementation notes

- Terraform layout: `infra/terraform/aws/{network,eks,rds,s3,iam,...}`.
  Modules are kept thin so a future provider swap re-implements the
  module interface, not the chart consumers.
- Helm chart layout: `infra/k8s/charts/<service>/` per app + shared
  values per environment in `infra/k8s/values.<env>.yaml`. EKS-specific
  values (IRSA role ARNs, ALB ingress class) live in
  `values.aws.yaml`.
- Two-role Postgres provisioning in RDS uses the `master` user (with
  `rds_superuser`) to run `packages/db/sql/roles.sql` once, then the
  app pool connects as `resto_app`. See
  `docs/runbooks/database-roles.md`.
- Observability collector: deploy AWS Distro for OpenTelemetry as a
  DaemonSet on EKS; OTLP from the api pods → collector → CloudWatch
  (logs, metrics) + X-Ray (traces; Tempo equivalent via the same
  pipeline if we keep the Grafana dashboards). Sentry stays
  off-cluster (SaaS).
- Update `docs/adr/README.md` index: drop the "Pending — hosting
  target" entry and add this ADR to the table.

## Follow-ups

- RES-85 — implement the Terraform + Helm chart per the layout above.
- RES-86 — switch the api Dockerfile to distroless now that the
  runtime platform is decided.
- ADR for multi-region promotion criteria when the first non-EU
  tenant signs.
