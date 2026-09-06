#!/usr/bin/env bash
set -euo pipefail

# Default: run on the operator workstation, not the production box. A full
# restore alongside the live Postgres on an 8 GB CX32 risks starving it —
# if this ever must run there, require at least 3x the compressed dump
# free on disk first and say so at the call site.

DUMP_FILE=""
R2_REMOTE="${R2_REMOTE:-r2}"
BACKUP_BUCKET="${BACKUP_BUCKET:-resto-backups}"
RCLONE_CONFIG="${RCLONE_CONFIG:-}"
APP_ROLE_PASSWORD="${APP_ROLE_PASSWORD:-drill_app_role_pwd_1234}"
AUTH_ROLE_PASSWORD="${AUTH_ROLE_PASSWORD:-drill_auth_role_pwd_1234}"
SCRATCH_PORT="${SCRATCH_PORT:-15432}"
SCRATCH_CONTAINER="resto-restore-drill"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

while [ $# -gt 0 ]; do
  case "$1" in
    --dump-file)
      DUMP_FILE="$2"
      shift 2
      ;;
    *)
      echo "restore-drill.sh: unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

START_EPOCH="$(date +%s)"
CLEANUP_DIR=""
cleanup() {
  # Deliberately not `[ -n "$CLEANUP_DIR" ] && rm -rf ...`: under `set -e`,
  # an EXIT trap whose last command evaluates false overrides the script's
  # real exit status — confirmed by reproduction, a passing drill was
  # reported as failed because this line's `&&` short-circuited to a
  # nonzero status whenever --dump-file left CLEANUP_DIR empty.
  docker rm -f "$SCRATCH_CONTAINER" >/dev/null 2>&1 || true
  if [ -n "$CLEANUP_DIR" ]; then
    rm -rf "$CLEANUP_DIR"
  fi
}
trap cleanup EXIT

# 1. Obtain the dump + manifest.
if [ -n "$DUMP_FILE" ]; then
  MANIFEST_FILE="${DUMP_FILE}.manifest.json"
  [ -f "$DUMP_FILE" ] || {
    echo "restore-drill.sh: dump file not found: $DUMP_FILE" >&2
    exit 1
  }
else
  [ -n "$RCLONE_CONFIG" ] || {
    echo "restore-drill.sh: RCLONE_CONFIG is required without --dump-file" >&2
    exit 1
  }
  LATEST_JSON="$(rclone lsjson --config "$RCLONE_CONFIG" "${R2_REMOTE}:${BACKUP_BUCKET}/backups/")"
  LATEST="$(printf '%s' "$LATEST_JSON" | python3 -c "
import json, sys
items = [i for i in json.load(sys.stdin) if i['Name'].endswith('.dump.gz')]
items.sort(key=lambda i: i['ModTime'])
print(items[-1]['Name'] if items else '')
")"
  [ -n "$LATEST" ] || {
    echo "restore-drill.sh: no backup objects found under backups/" >&2
    exit 1
  }
  AGE_SECONDS="$(printf '%s' "$LATEST_JSON" | python3 -c "
import json, sys
from datetime import datetime, timezone
items = {i['Name']: i['ModTime'] for i in json.load(sys.stdin)}
mod = datetime.fromisoformat('$LATEST' and items['$LATEST'].replace('Z', '+00:00'))
print(int((datetime.now(timezone.utc) - mod).total_seconds()))
")"
  # RPO <= 24h is the stated target; 26h gives cron jitter room without
  # letting a silently-broken schedule pass as healthy.
  [ "$AGE_SECONDS" -lt 93600 ] || {
    echo "restore-drill.sh: newest backup ($LATEST) is ${AGE_SECONDS}s old (> 26h) — cron may be broken" >&2
    exit 1
  }
  CLEANUP_DIR="$(mktemp -d)"
  rclone copy --config "$RCLONE_CONFIG" "${R2_REMOTE}:${BACKUP_BUCKET}/backups/${LATEST}" "$CLEANUP_DIR/"
  rclone copy --config "$RCLONE_CONFIG" "${R2_REMOTE}:${BACKUP_BUCKET}/backups/${LATEST}.manifest.json" "$CLEANUP_DIR/"
  DUMP_FILE="$CLEANUP_DIR/$LATEST"
  MANIFEST_FILE="$CLEANUP_DIR/${LATEST}.manifest.json"
fi

[ -f "$MANIFEST_FILE" ] || {
  echo "restore-drill.sh: manifest not found: $MANIFEST_FILE" >&2
  exit 1
}

WORKDUMP="$DUMP_FILE"
case "$DUMP_FILE" in
  *.gz)
    WORKDUMP="${DUMP_FILE%.gz}.restore"
    gunzip -c "$DUMP_FILE" >"$WORKDUMP"
    ;;
esac

# 2. Throwaway scratch Postgres.
docker rm -f "$SCRATCH_CONTAINER" >/dev/null 2>&1 || true
docker run -d --name "$SCRATCH_CONTAINER" \
  -e POSTGRES_USER=drill_admin -e POSTGRES_PASSWORD=drill_admin_pwd -e POSTGRES_DB=resto_drill \
  -p "${SCRATCH_PORT}:5432" \
  postgres:16-alpine >/dev/null

for _ in $(seq 1 30); do
  docker exec "$SCRATCH_CONTAINER" pg_isready -U drill_admin -d resto_drill >/dev/null 2>&1 && break
  sleep 1
done

# `--no-owner --no-acl` strips OWNER TO and GRANT/REVOKE statements, but not
# `CREATE POLICY ... TO resto_auth` — RLS policies name a role directly and
# pg_restore does not classify that as an ACL statement. Confirmed by
# running restore-drill.sh once without this step: pg_restore --exit-on-error
# aborted on the first such policy with "role \"resto_auth\" does not
# exist". Bare, unprivileged roles here are enough for the policy DDL to
# resolve; provision-roles-ci.ts (idempotent — checks pg_roles and ALTERs
# rather than re-CREATEs) gives them their real attributes and password
# afterward, in ci.yml order.
docker exec "$SCRATCH_CONTAINER" psql -U drill_admin -d resto_drill -v ON_ERROR_STOP=1 -c "
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'resto_app') THEN CREATE ROLE resto_app; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'resto_auth') THEN CREATE ROLE resto_auth; END IF;
END \$\$;
"

# 3. Restore. --no-owner --no-acl is the correct model, not a workaround:
# the dump's owner/grantees do not exist on a fresh cluster, and ownership
# + grants are re-established by the committed provisioning below, exactly
# as a real recovery onto a new box would do. --exit-on-error is load-
# bearing: without it pg_restore continues past failures and still exits
# 0 (confirmed: `pg_restore --help` describes it as "exit on error,
# default is to continue"), so a dump that restored 6 of 78 tables would
# otherwise pass.
docker cp "$WORKDUMP" "${SCRATCH_CONTAINER}:/tmp/restore.dump"
docker exec "$SCRATCH_CONTAINER" pg_restore --exit-on-error --no-owner --no-acl \
  -U drill_admin -d resto_drill /tmp/restore.dump

SCRATCH_ADMIN_URL="postgresql://drill_admin:drill_admin_pwd@localhost:${SCRATCH_PORT}/resto_drill"

# 4. ci.yml order: migrations first, roles second — auth-role.sql's GRANT
# is unguarded and raises `relation "user" does not exist` on a database
# with no tables if roles run first.
(
  cd "$REPO_ROOT/packages/db"
  DATABASE_ADMIN_URL="$SCRATCH_ADMIN_URL" pnpm exec tsx src/cli/migrate.ts
)
(
  cd "$REPO_ROOT"
  DATABASE_ADMIN_URL="$SCRATCH_ADMIN_URL" \
    APP_ROLE_PASSWORD="$APP_ROLE_PASSWORD" \
    AUTH_ROLE_PASSWORD="$AUTH_ROLE_PASSWORD" \
    pnpm exec tsx --tsconfig packages/db/tsconfig.json packages/db/src/cli/provision-roles-ci.ts
)

# 5. Verify.
JOURNAL_COUNT="$(python3 -c "import json; print(len(json.load(open('$REPO_ROOT/packages/db/migrations/meta/_journal.json'))['entries']))")"
ACTUAL_MIGRATIONS="$(docker exec "$SCRATCH_CONTAINER" psql -U drill_admin -d resto_drill -t -A -c "SELECT count(*) FROM drizzle.__drizzle_migrations")"
[ "$ACTUAL_MIGRATIONS" = "$JOURNAL_COUNT" ] || {
  echo "restore-drill.sh: FAILED — __drizzle_migrations has $ACTUAL_MIGRATIONS rows, journal has $JOURNAL_COUNT" >&2
  exit 1
}

ROLE_CHECK="$(docker exec "$SCRATCH_CONTAINER" psql -U drill_admin -d resto_drill -t -A -F',' -c \
  "SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname IN ('resto_app','resto_auth') ORDER BY rolname")"
echo "restore-drill.sh: roles: $ROLE_CHECK"
if printf '%s' "$ROLE_CHECK" | grep -qE ',t(,|$)'; then
  echo "restore-drill.sh: FAILED — a provisioned role has rolsuper or rolbypassrls true" >&2
  exit 1
fi
[ "$(printf '%s\n' "$ROLE_CHECK" | wc -l | tr -d ' ')" = "2" ] || {
  echo "restore-drill.sh: FAILED — expected resto_app and resto_auth both present" >&2
  exit 1
}

# Re-read the four counts AS resto_app, not the scratch superuser — a
# superuser cannot see a missing grant, and proving the app role can read
# its own data is most of what recoverability means. app_bind_tenant('',
# true) is the same SECURITY DEFINER bypass packages/db's withoutTenant()
# uses internally (client.ts) — this replicates it over a raw psql
# connection rather than inventing a separate bypass path.
# Positional line-parsing of psql output is fragile — `app_bind_tenant`'s
# void return and the BEGIN/COMMIT command tags both emit lines even under
# `-t`, which shifted every count by one the first time this ran (caught
# before this script shipped: tenants read back as the orders count).
# `\echo` with tagged, `\gset`-captured values sidesteps that entirely.
APP_COUNTS="$(docker exec -i "$SCRATCH_CONTAINER" env PGPASSWORD="$APP_ROLE_PASSWORD" psql -U resto_app -d resto_drill -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
SELECT app_bind_tenant('', true);
\pset tuples_only on
\pset format unaligned
SELECT count(*) AS tenants_count FROM tenants \gset
SELECT count(*) AS orders_count FROM orders \gset
SELECT count(*) AS menu_items_count FROM menu_items \gset
SELECT count(*) AS tenant_domains_count FROM tenant_domains \gset
\pset tuples_only off
\pset format aligned
\echo COUNTS tenants=:tenants_count orders=:orders_count menu_items=:menu_items_count tenant_domains=:tenant_domains_count
COMMIT;
SQL
)"

COUNTS_LINE="$(printf '%s\n' "$APP_COUNTS" | grep '^COUNTS ')"
[ -n "$COUNTS_LINE" ] || {
  echo "restore-drill.sh: FAILED — could not read counts back as resto_app" >&2
  printf '%s\n' "$APP_COUNTS" >&2
  exit 1
}

EXPECTED_TENANTS="$(python3 -c "import json; print(json.load(open('$MANIFEST_FILE'))['counts']['tenants'])")"
EXPECTED_ORDERS="$(python3 -c "import json; print(json.load(open('$MANIFEST_FILE'))['counts']['orders'])")"
EXPECTED_MENU_ITEMS="$(python3 -c "import json; print(json.load(open('$MANIFEST_FILE'))['counts']['menu_items'])")"
EXPECTED_TENANT_DOMAINS="$(python3 -c "import json; print(json.load(open('$MANIFEST_FILE'))['counts']['tenant_domains'])")"

ACTUAL_TENANTS="$(echo "$COUNTS_LINE" | sed -n 's/.*tenants=\([0-9]*\).*/\1/p')"
ACTUAL_ORDERS="$(echo "$COUNTS_LINE" | sed -n 's/.*orders=\([0-9]*\).*/\1/p')"
ACTUAL_MENU_ITEMS="$(echo "$COUNTS_LINE" | sed -n 's/.*menu_items=\([0-9]*\).*/\1/p')"
ACTUAL_TENANT_DOMAINS="$(echo "$COUNTS_LINE" | sed -n 's/.*tenant_domains=\([0-9]*\).*/\1/p')"

FAILED=0
for pair in "tenants:$EXPECTED_TENANTS:$ACTUAL_TENANTS" "orders:$EXPECTED_ORDERS:$ACTUAL_ORDERS" \
  "menu_items:$EXPECTED_MENU_ITEMS:$ACTUAL_MENU_ITEMS" "tenant_domains:$EXPECTED_TENANT_DOMAINS:$ACTUAL_TENANT_DOMAINS"; do
  name="${pair%%:*}"
  rest="${pair#*:}"
  expected="${rest%%:*}"
  actual="${rest#*:}"
  if [ "$expected" != "$actual" ]; then
    echo "restore-drill.sh: FAILED — $name expected=$expected actual(resto_app)=$actual" >&2
    FAILED=1
  fi
done
[ "$FAILED" -eq 0 ] || exit 1

END_EPOCH="$(date +%s)"
ELAPSED=$((END_EPOCH - START_EPOCH))

echo "restore-drill.sh: PASSED elapsed=${ELAPSED}s tenants=${ACTUAL_TENANTS} orders=${ACTUAL_ORDERS} menu_items=${ACTUAL_MENU_ITEMS} tenant_domains=${ACTUAL_TENANT_DOMAINS} observed_rto=${ELAPSED}s"
