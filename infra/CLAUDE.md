# infra/

## Purpose

Infrastructure-as-code and runtime artifacts. Production deploys are
reproducible from this folder alone.

## Layout

- `docker/` — `docker-compose.dev.yml` (local dev stack: Postgres, NATS,
  MinIO, MailHog, Jaeger — no Redis), `docker-compose.prod.yml` (the
  production stack: `postgres` + `nats` + `api` + `website` + `caddy`, plus
  a profile-gated `migrate` service), `Caddyfile` (TLS termination +
  Host/path routing), `env/*.env.example` (templates rendered by
  `render-env.sh`), Dockerfiles per app. Identity (Better Auth) runs
  in-process inside `apps/api`, so there is no separate IdP container in
  dev or prod.
- `scripts/` — bootstrap and verification tooling: `render-env.sh`
  (template → mode-600 `.env`), `backup-nightly.sh` + `restore-drill.sh`
  (backup/restore lifecycle), `local-prod-rehearsal.sh` (boots the whole
  production compose shape on a laptop before it runs on a box),
  `assert-no-domain-literals.sh` / `assert-hostname-depth.sh` /
  `assert-no-destructive-compose.sh` (CI-shaped guards, each with a
  `--self-test`).
- `runbooks/` — operational checklists (2FA recovery, SPF/DKIM/DMARC) —
  distinct from `docs/runbooks/`, which documents this repo's own
  infrastructure decisions.

## Rules

- **Secrets never in plaintext.** `.env` files on the box are mode-600,
  rendered from the committed `.env.example` templates by
  `render-env.sh` — real values are injected at deploy time, never
  committed.
- **Image tags are immutable.** Build with the commit SHA (or an
  equivalent unique tag), push to GHCR, never overwrite a tag already
  deployed.
- **Migrations run as a distinct gated step** (`docker compose run --rm
migrate`), never inline at app container startup. The `migrate` service
  is `profiles: ["tools"]` so a bare `up -d` can never trigger it.
- **No compose invocation in this repo's executable content may carry
  `down` or `-v`/`--volumes`** — `assert-no-destructive-compose.sh`
  enforces this in CI. See `docs/runbooks/production-stack.md`'s `-v`
  warning for the by-hand equivalent.
- **The domain-literal and hostname-depth guards read a single apex
  parameter** (`PUBLIC_APEX_DOMAIN`) — there is exactly one apex in this
  repo's templates, guards and rehearsal. Do not reintroduce a second one
  without updating both guard scripts and their self-tests.

## Superseded (historical)

Before 2026-06-26, the stated production target was AWS EKS with
Terraform-managed RDS/ElastiCache/IAM (ADR-0011), Helm charts in `infra/k8s/`,
and migrations run as a Kubernetes Job. That target was abandoned in favor of
the single-VPS Docker Compose shape described above; `infra/terraform/` and
`infra/k8s/` have been deleted. `docs/adr/` no longer exists in this
repository — do not go looking for ADR-0011.
