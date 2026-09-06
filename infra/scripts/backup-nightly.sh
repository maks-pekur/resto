#!/usr/bin/env bash
set -euo pipefail

# Never calls `docker compose` — assert-no-destructive-compose.sh has
# nothing to find here by construction, not by exemption.

BACKUP_DIR="${BACKUP_DIR:-/opt/resto/backups}"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-resto-prod}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-}"
BACKUP_LOCAL_ONLY="${BACKUP_LOCAL_ONLY:-0}"
R2_REMOTE="${R2_REMOTE:-r2}"
BACKUP_BUCKET="${BACKUP_BUCKET:-resto-backups}"
RCLONE_CONFIG="${RCLONE_CONFIG:-}"

mkdir -p "$BACKUP_DIR"

if [ -z "$POSTGRES_CONTAINER" ]; then
  POSTGRES_CONTAINER="$(docker ps \
    --filter "label=com.docker.compose.project=${COMPOSE_PROJECT_NAME}" \
    --filter "label=com.docker.compose.service=postgres" \
    --format '{{.Names}}' | head -1)"
fi
[ -n "$POSTGRES_CONTAINER" ] || {
  echo "backup-nightly.sh: postgres container not found (set POSTGRES_CONTAINER or COMPOSE_PROJECT_NAME)" >&2
  exit 1
}

PG_USER="$(docker exec "$POSTGRES_CONTAINER" printenv POSTGRES_USER)"
PG_DB="$(docker exec "$POSTGRES_CONTAINER" printenv POSTGRES_DB)"

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
RAW_KEY="resto-${TIMESTAMP}.dump"
GZ_KEY="${RAW_KEY}.gz"
MANIFEST_KEY="${GZ_KEY}.manifest.json"
IN_CONTAINER_DUMP="/tmp/${RAW_KEY}"
IN_CONTAINER_SNAP="/tmp/${TIMESTAMP}.snap"

# The manifest counts and the dump share one REPEATABLE READ transaction's
# exported snapshot (`pg_export_snapshot()` + `pg_dump --snapshot=`) — a
# dump and a manifest taken via two separate connections could otherwise
# disagree by whatever wrote in between, which is exactly the gap G-02's
# "content checks do not check content" finding was about. psql's `\!`
# does not interpolate `:variable` into its shell command (verified: it
# passes the literal string through), so the snapshot id is written to a
# file with `\o` and read back by the spawned shell instead.
PSQL_LOG="$(mktemp)"
docker exec -i "$POSTGRES_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -v ON_ERROR_STOP=1 >"$PSQL_LOG" <<SQL
BEGIN ISOLATION LEVEL REPEATABLE READ;
\pset tuples_only on
\pset format unaligned
\o ${IN_CONTAINER_SNAP}
SELECT pg_export_snapshot();
\o
\pset tuples_only off
\pset format aligned
SELECT now() AS dump_ts \gset
SELECT count(*) AS tenants_count FROM tenants \gset
SELECT count(*) AS orders_count FROM orders \gset
SELECT count(*) AS menu_items_count FROM menu_items \gset
SELECT count(*) AS tenant_domains_count FROM tenant_domains \gset
\echo MANIFEST dump_ts=:dump_ts tenants=:tenants_count orders=:orders_count menu_items=:menu_items_count tenant_domains=:tenant_domains_count
\! pg_dump -U ${PG_USER} -d ${PG_DB} -Fc --snapshot="\$(cat ${IN_CONTAINER_SNAP})" -f ${IN_CONTAINER_DUMP} && echo PGDUMP_OK
\! rm -f ${IN_CONTAINER_SNAP}
COMMIT;
SQL

grep -q '^PGDUMP_OK$' "$PSQL_LOG" || {
  echo "backup-nightly.sh: pg_dump did not complete — see log below" >&2
  cat "$PSQL_LOG" >&2
  exit 1
}

MANIFEST_LINE="$(grep '^MANIFEST ' "$PSQL_LOG")"
DUMP_TS="$(echo "$MANIFEST_LINE" | sed -n 's/.*dump_ts=\([^ ]* [^ ]*\) tenants=.*/\1/p')"
TENANTS="$(echo "$MANIFEST_LINE" | sed -n 's/.*tenants=\([0-9]*\).*/\1/p')"
ORDERS="$(echo "$MANIFEST_LINE" | sed -n 's/.*orders=\([0-9]*\).*/\1/p')"
MENU_ITEMS="$(echo "$MANIFEST_LINE" | sed -n 's/.*menu_items=\([0-9]*\).*/\1/p')"
TENANT_DOMAINS="$(echo "$MANIFEST_LINE" | sed -n 's/.*tenant_domains=\([0-9]*\).*/\1/p')"
rm -f "$PSQL_LOG"

docker cp "${POSTGRES_CONTAINER}:${IN_CONTAINER_DUMP}" "${BACKUP_DIR}/${RAW_KEY}"
docker exec "$POSTGRES_CONTAINER" rm -f "$IN_CONTAINER_DUMP"
gzip -f "${BACKUP_DIR}/${RAW_KEY}"

cat >"${BACKUP_DIR}/${MANIFEST_KEY}" <<JSON
{
  "dumpKey": "${GZ_KEY}",
  "dumpTimestamp": "${DUMP_TS}",
  "counts": {
    "tenants": ${TENANTS},
    "orders": ${ORDERS},
    "menu_items": ${MENU_ITEMS},
    "tenant_domains": ${TENANT_DOMAINS}
  }
}
JSON

BYTES="$(wc -c <"${BACKUP_DIR}/${GZ_KEY}" | tr -d ' ')"

if [ "$BACKUP_LOCAL_ONLY" = "1" ]; then
  echo "backup-nightly.sh: object=backups/${GZ_KEY} bytes=${BYTES} (local only, not uploaded)"
  exit 0
fi

[ -n "$RCLONE_CONFIG" ] || {
  echo "backup-nightly.sh: RCLONE_CONFIG is required outside BACKUP_LOCAL_ONLY=1" >&2
  exit 1
}

rclone copy --config "$RCLONE_CONFIG" "${BACKUP_DIR}/${GZ_KEY}" "${R2_REMOTE}:${BACKUP_BUCKET}/backups/"
rclone copy --config "$RCLONE_CONFIG" "${BACKUP_DIR}/${MANIFEST_KEY}" "${R2_REMOTE}:${BACKUP_BUCKET}/backups/"

rm -f "${BACKUP_DIR}/${GZ_KEY}" "${BACKUP_DIR}/${MANIFEST_KEY}"

echo "backup-nightly.sh: object=backups/${GZ_KEY} bytes=${BYTES}"
