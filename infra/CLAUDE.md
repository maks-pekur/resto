# infra/

## Purpose

Infrastructure-as-code and runtime artifacts. Production deploys are
reproducible from this folder alone.

## Layout

- `docker/` — Dockerfiles for each app and `docker-compose.dev.yml` for the
  local development stack (Postgres, Redis, NATS, Keycloak, MinIO, MailHog,
  Jaeger).
- `k8s/` — Helm charts and/or raw manifests for staging and production.
  Chart values per environment in `values.<env>.yaml`. Will be populated
  once a hosting target is chosen.
- `terraform/` — IaC for cloud infrastructure (managed K8s cluster, VPC,
  managed Postgres, object storage, secrets). Provider choice is
  pending — see `docs/adr/0009-hosting-target.md` once written.

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
