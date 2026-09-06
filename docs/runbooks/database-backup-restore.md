# Database Backup & Restore

## Cadence and retention

- **Nightly, 03:00 UTC** — lowest-traffic window; `infra/scripts/backup-nightly.sh` via cron/systemd timer on the box.
- **Retention: 14 days**, via an R2 lifecycle rule on the `backups/` prefix. No plan in this phase configures the lifecycle rule itself — a founder-side R2 dashboard action, tracked alongside the other Cloudflare setup in plan 08's runbook.
- **Targets:** RPO ≤ 24h (nightly cadence gives ~23h worst case), RTO target < 1h (the drill's observed elapsed time is the evidence this holds).

## `backup-nightly.sh`

`docker exec`s into the running `postgres` container (found via the
`com.docker.compose.project` / `com.docker.compose.service` labels Compose
sets automatically — never `docker compose` itself, so
`assert-no-destructive-compose.sh` has nothing to find in this script).

The dump and its manifest are taken from **the same transaction's exported
snapshot** (`pg_export_snapshot()` + `pg_dump --snapshot=`) — not two
separate reads a few seconds apart. Without that, a write landing between
the dump and the manifest query would make the manifest lie about what the
dump actually contains, which defeats the point of having one. The
manifest records `tenants`, `orders`, `menu_items`, `tenant_domains` row
counts and the dump's timestamp, uploaded next to the dump as
`<dump-key>.manifest.json`.

```
backup-nightly.sh                      # nightly cron invocation
BACKUP_LOCAL_ONLY=1 backup-nightly.sh  # rehearsal / manual run, no R2 upload
```

Required env: `RCLONE_CONFIG` (path to the rclone config carrying the R2
remote), `R2_REMOTE`, `BACKUP_BUCKET`. `POSTGRES_CONTAINER` /
`COMPOSE_PROJECT_NAME` override container discovery when needed.

## `restore-drill.sh`

**Runs on the operator workstation by default**, not the production box —
a full restore alongside the live Postgres on an 8 GB CX32 risks starving
it. If it must ever run on the box, require at least 3x the compressed
dump size free on disk first.

Sequence:

1. Fetch the newest object under `backups/` via `rclone` (`--dump-file`
   bypasses this for local rehearsal use) and **assert it is under 26
   hours old** — a cron that silently broke weeks ago would otherwise
   restore cleanly and report a healthy drill while the RPO target is
   fiction.
2. A throwaway `postgres:16-alpine` container on an ephemeral port.
3. Pre-create bare `resto_app` / `resto_auth` roles. This step exists
   because `--no-owner --no-acl` strips `OWNER TO` and `GRANT`/`REVOKE`
   statements but **not** `CREATE POLICY ... TO resto_auth` — an RLS
   policy names its role directly, which `pg_restore` does not classify
   as an ACL statement. Discovered by running the drill once without this
   step: `pg_restore --exit-on-error` aborted with `role "resto_auth"
does not exist` on the first such policy.
4. `pg_restore --exit-on-error --no-owner --no-acl`. `--exit-on-error` is
   load-bearing — confirmed via `pg_restore --help`, which describes the
   flag as `"exit on error, default is to continue"` — so without it a
   dump that restored 6 of 78 tables would still exit 0.
5. `migrate.ts` (catch-up — a no-op against an already-current dump), then
   `provision-roles-ci.ts` (idempotent: `ALTER ROLE` when the role already
   exists) — migrations first, roles second, the same order
   `.github/workflows/ci.yml` uses.
6. Verify: `drizzle.__drizzle_migrations` row count equals
   `packages/db/migrations/meta/_journal.json`'s entry count; `pg_roles`
   shows both roles with `rolsuper=false` and `rolbypassrls=false`; the
   four manifest counts are re-read **connected as `resto_app`**, not the
   scratch superuser, via `SELECT app_bind_tenant('', true)` — the same
   `SECURITY DEFINER` bypass `packages/db`'s `withoutTenant()` uses
   internally — because a superuser cannot see a missing grant, and
   proving the app role can read its own data is most of what
   recoverability means.
7. `docker rm -f` the scratch container (never a compose `-v`) and print
   the observed elapsed time as RTO.

```
restore-drill.sh --dump-file /path/to/dump.gz   # local dump (rehearsal)
restore-drill.sh                                 # fetches newest from R2
```

## Drill log

| Date       | Trigger                                                   | Elapsed (RTO)    | tenants   | orders   | menu_items   | tenant_domains   | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------- | --------------------------------------------------------- | ---------------- | --------- | -------- | ------------ | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-09-05 | Local rehearsal (`local-prod-rehearsal.sh`, plan 07.5-06) | observed RTO: 6s | tenants=0 | orders=0 | menu_items=0 | tenant_domains=0 | First entry — proves the whole sequence (build, migrate, provision, boot, backup, restore) against a locally-booted production stack under synthetic credentials, before any real box exists. All-zero counts are correct here: the rehearsal's Postgres is freshly migrated with no seed data, matching a brand-new box before the first tenant signs up. The counting/comparison mechanism's discriminating power was verified separately against a real dataset (2 tenants / 7 orders / 27 menu_items / 3 tenant_domains, dev Postgres) plus a negative test — a manifest tampered to expect 999 orders was correctly rejected (`restore-drill.sh: FAILED — orders expected=999 actual(resto_app)=7`). Plan 10 appends the first production drill below this row.                                                                                    |
| 2026-09-06 | Local rehearsal (`local-prod-rehearsal.sh`, plan 07.5-14) | observed RTO: 7s | tenants=2 | orders=3 | menu_items=3 | tenant_domains=2 | The zero-to-zero gap above is closed: the rehearsal now seeds two tenants (including a `pizza` tenant used by the same run's `/v1/menu` wildcard-host proof), two locations, two tenant_domains rows, two menu_categories, three menu_items and three orders directly via `psql` before calling `backup-nightly.sh`, and refuses to proceed if any of the four manifest-tracked counts is zero. `restore-drill.sh: PASSED elapsed=7s tenants=2 orders=3 menu_items=3 tenant_domains=2 observed_rto=7s`. Watched failing too: the same dump's manifest was copied and hand-tampered (`tenants: 2 -> 3`), and a second `restore-drill.sh` invocation against the tampered copy correctly reported `restore-drill.sh: FAILED — tenants expected=3 actual(resto_app)=2`. A green `PASSED` on this row is no longer indistinguishable from a meaningful one. |
