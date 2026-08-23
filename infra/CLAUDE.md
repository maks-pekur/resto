# infra/

## Purpose

Infrastructure-as-code and runtime artifacts. Production deploys are
reproducible from this folder alone.

## Layout

- `docker/` — Dockerfiles for each app and `docker-compose.dev.yml` for the
  local development stack (Postgres, Redis, NATS, MinIO, MailHog, Jaeger).
  Identity (Better Auth) runs in-process inside `apps/api` per ADR-0013, so
  there is no separate IdP container in dev or prod.
- `k8s/` — Helm charts and/or raw manifests for staging and production.
  Chart values per environment in `values.<env>.yaml`. Layout per ADR-0011
  (`charts/<service>/`, `values.<env>.yaml`, `values.aws.yaml` for
  EKS-specific bits).
- `terraform/` — IaC for AWS infrastructure (EKS, RDS, S3, ElastiCache,
  IAM/IRSA, Secrets Manager). Provider chosen in
  [ADR-0011](../docs/adr/0011-hosting-on-aws.md).

## Rules

- **Secrets never in plaintext.** Vault / 1Password Connect / cloud secret
  manager only. `.env.example` files document shape, real values are
  injected at runtime.
- **State files** for Terraform live in remote backend (configured per
  hosting choice), never in git.
- **Per-environment overlays** — `dev`, `staging`, `prod`. Promotion
  requires PR + approval, never `kubectl apply` from a workstation.
- **Image tags** are immutable: build with the commit SHA, never overwrite.
- **Migrations** run as a Kubernetes Job before app rollout; never inline
  in app startup.
