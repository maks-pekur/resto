# Production Stack — Bring-Up, Rotation, and the `trusted_proxies` Decision

The production runtime is a single VPS running Docker Compose:
`postgres` + `nats` + `api` + `website` + `caddy`, plus a profile-gated
`migrate` service that never starts on a bare `up -d`. Everything that
defines the runtime is committed:

- `infra/docker/docker-compose.prod.yml` — the stack (project name `resto-prod`)
- `infra/docker/Caddyfile` — TLS termination + Host-based routing
- `infra/docker/env/*.env.example` — templates, expanded by `infra/scripts/render-env.sh`
- `apps/api/Dockerfile`'s `migrate` stage — the one-off image that runs migrations and role provisioning

No hand-typed server state defines what runs. A redeploy is: pull the
committed files, render the env templates, `docker compose up -d`.

## The one-apex map

A single parameter — `PUBLIC_APEX_DOMAIN` — because Cloudflare's free
Universal SSL covers the root domain and its first-level subdomains only,
not deeper subdomains. Every hostname this stack serves must stay at
depth ≤ 1 above that one apex: `<apex>` itself (depth 0), `api.<apex>`
and `<slug>.<apex>` (depth 1) all carry a certificate; `<slug>.menu.<apex>`
(depth 2) would not, which is why there is no `.menu.` label anywhere in
this stack. `infra/scripts/assert-hostname-depth.sh` computes every
configured hostname's depth relative to the one apex in CI; it does not
itself prove the certificate covers a host — that is the live handshake
in plan 08's `verify-prod-origin.sh --stage full`.

**One apex, one zone, one certificate.** Caddy serves `{$API_HOST}`
(`api.<apex>`) and `{$WEBSITE_HOST}, *.{$WEBSITE_HOST}` (`<apex>` and
every tenant subdomain) — the second block's `handle` path split (see
`infra/docker/Caddyfile`) is what makes `/v1/*` and `/api/*` reach the
api same-origin on a tenant host, `/internal*` 404 before it reaches
either upstream, and everything else fall through to the website. The
admin and qr-menu SPAs are served by their own Cloudflare Workers
(assets-only, no Worker script) bound to Worker Routes on
`<apex>/admin*` and `*.<apex>/qr*` — those requests are answered at
Cloudflare's edge and never reach this origin at all. The Origin CA
certificate is issued once, with SANs `<apex>`, `*.<apex>`, `api.<apex>`,
covering both what Caddy serves and what the Workers intercept ahead of
it.

**The operator session cookie is host-only.** `AUTH_COOKIE_DOMAIN` is
absent from the rendered production env (07.4-06) — Better Auth's default
scopes the cookie to the exact host that issued it, so it cannot leak to
a guest tenant host even in principle. `assert-hostname-depth.sh` still
checks it in `HOST_KEYS` for the day a future deployment sets one.

## Postgres tuning (unmeasured)

`shared_buffers=1GB`, `effective_cache_size=3GB`, `max_connections=40` are
starting values for an unmeasured Hetzner CX32 (4 vCPU / 8 GB), not a
benchmarked configuration. Revisit once the box has real traffic and
`pg_stat_activity`/connection-count data to tune against.

## The `trusted_proxies` decision

`infra/docker/Caddyfile`'s global `servers` block sets
`trusted_proxies static 0.0.0.0/0 ::/0`. Read literally this looks like a
mistake — trusting every peer — and it would be one, except for what it
depends on:

1. **Why it exists at all.** Without it, `reverse_proxy` overwrites
   `X-Forwarded-Host` with the request's own Host (`api.<apex>`).
   `effectiveHost()` then returns that, and
   `NON_GUEST_SECOND_LABELS = new Set(['admin','api','www'])`
   (`tenant-resolver.service.ts`) rejects it — no tenant ever binds and
   every guest menu request dies. The Cloudflare Worker → origin hop is
   the one research's Pitfall #3 stopped one hop short of.
2. **Why the blanket range is acceptable.** `ufw` (plan 08) admits 80/443
   from Cloudflare's published ranges alone. The only client Caddy can
   ever see on those ports is already a trusted proxy. **This is void the
   moment that firewall rule changes** — if `ufw` is ever relaxed, this
   line must be scoped to Cloudflare's ranges instead of `0.0.0.0/0`.
3. **Why `client_ip_headers CF-Connecting-IP` is not optional once (1) is
   in place.** With every peer trusted, Caddy's right-to-left walk over
   `X-Forwarded-For` finds nothing untrusted and returns the **leftmost**
   entry — which is whatever the client sent. Cloudflare _appends_ the
   visitor's address to a client-supplied `X-Forwarded-For` rather than
   replacing it, so a forged value stays leftmost and wins. Cloudflare
   does overwrite `CF-Connecting-IP`, so reading that header instead is
   what makes `client_ip` mean anything on this origin.

   Verified live against the pinned tag (`caddy:2.11-alpine`) with the
   committed Caddyfile: a request carrying only a forged
   `X-Forwarded-For` matching the `/internal*` allowlist is rejected
   (404); the same allowlisted address via `CF-Connecting-IP` is admitted
   (200); a forged `X-Forwarded-For` alongside a real, allowlisted
   `CF-Connecting-IP` is still admitted (the real header wins); and
   `X-Forwarded-Host` is preserved end to end through `reverse_proxy`
   regardless.

4. **What actually protects `/internal*`.** The Caddy `client_ip` gate is
   defense in depth, not the control — `InternalTokenGuard`
   (constant-time compare against `INTERNAL_API_TOKEN`, throws outside
   `NODE_ENV=development`) is. Do not describe the Caddy gate as the
   thing that makes the seed CLI's use of `/internal/v1/*` safe.

## `TRUST_PROXY` is wider than the Docker bridge

Caddy appends its own direct peer to the inbound `X-Forwarded-For`, so the
api receives `XFF: <client>, <cloudflare-pop>, <caddy-peer>`. With only
the bridge range (`172.16.0.0/12`) trusted, Fastify's `trustProxy` walk
stops at the first untrusted hop — the Cloudflare PoP — and `req.ip`
becomes the PoP's address, not the visitor's.
`rateLimitKeyGenerator` keys anonymous and credential-route traffic on
`ip:${req.ip}`, so a bridge-only `TRUST_PROXY` turns
`RATE_LIMIT_AUTH_SIGNIN_PER_MIN` into a **per-PoP** limit: one abusive
client can lock out a whole restaurant's staff, and credential stuffing
dilutes across PoPs. `api.env.example`'s `TRUST_PROXY` is the Docker
bridge range **plus** Cloudflare's published edge ranges
(`cloudflare.com/ips`). Widening is safe for tenant resolution — it only
ever checks `TRUST_PROXY.length > 0`, a boolean, never the CIDRs
themselves.

## Bring-up sequence

1. Copy the three templates from `infra/docker/env/` onto the box (never
   the templates with real values committed anywhere).
2. Fill in `compose.env` with real secrets, then render the other two:
   ```
   set -a; source /opt/resto/.env; set +a
   infra/scripts/render-env.sh infra/docker/env/api.env.example /opt/resto/.env.api
   infra/scripts/render-env.sh infra/docker/env/website.env.example /opt/resto/.env.website
   ```
3. `docker compose -f docker-compose.prod.yml up -d postgres nats`, wait healthy.
4. Run migrations, then roles, through the profile-gated `migrate` service
   — **migrations first, roles second** (`.github/workflows/ci.yml`'s
   order; `auth-role.sql`'s `GRANT` is unguarded and fails on a database
   with no tables if reversed):
   ```
   docker compose run --rm -e DATABASE_ADMIN_URL=... migrate \
     /workspace/node_modules/.bin/tsx src/cli/migrate.ts
   docker compose run --rm -e DATABASE_ADMIN_URL=... -e APP_ROLE_PASSWORD=... -e AUTH_ROLE_PASSWORD=... migrate \
     /workspace/node_modules/.bin/tsx src/cli/provision-roles-ci.ts
   ```
5. `docker compose up -d` (brings up `api`, `website`, `caddy`; `migrate`
   stays down — it is profile-gated).

## Secret rotation

- **Role passwords** (`APP_ROLE_PASSWORD` / `AUTH_ROLE_PASSWORD`): re-run
  `provision-roles-ci.ts` with the new password (idempotent — `ALTER ROLE`
  when the role exists), then update `DATABASE_URL` /
  `BETTER_AUTH_DATABASE_URL` in `.env.api` and restart `api`.
- **`DATABASE_ADMIN_URL`** never lives on the box — it is supplied per
  invocation to the `migrate` service only. There is nothing to rotate on
  disk.
- **Stripe / Resend keys**: update `.env.api`, `docker compose up -d --no-deps api`.

## The `-v` warning

No compose invocation in this repository's executable content (scripts,
CI workflows, the compose files themselves) may carry `down` or
`-v`/`--volumes` — `infra/scripts/assert-no-destructive-compose.sh`
enforces this in CI. **This is the one command that must never be run by
hand against the production project either**: `docker compose -p
resto-prod down -v` destroys `postgres-data` and `nats-data` with no
prompt. Stop and remove individual containers
(`docker compose stop <service>`, `docker compose rm -f <service>`)
instead — the same pattern `local-prod-rehearsal.sh` uses for its own
teardown.

## Ports

`caddy` is the only service publishing ports to the host (`80:80`,
`443:443`), asserted by `docker compose config` rather than left to
review. `postgres` and `nats` publish nothing — the only path to them is
through the Docker network Caddy and the app containers share, or
`docker exec` from the box itself.
