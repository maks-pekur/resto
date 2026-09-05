#!/usr/bin/env bash
set -euo pipefail

# Boots the production compose stack locally under NODE_ENV=production and
# proves the whole sequence — build, migrate, provision, boot, backup,
# restore — end to end before a single euro is spent on a server.
#
# Every credential below is synthetic and local-only. Nothing here calls
# Stripe: its constructor is inert (verified — see the constructor-
# inertness check further down) and its guardrail is a string comparison.
# Resend is different, discovered by running this rehearsal rather than
# by reading the source: `assertEmailAdapterWired` (identity-core.module.ts)
# unconditionally calls `adapter.verifyTransport()` in NODE_ENV=production/
# staging, and the Resend adapter's verifyTransport() calls the *real*
# `domains.list()` endpoint (resend.adapter.ts) — a genuine network call
# neither the constructor-inertness check nor assertProdGuardrails's string
# comparisons cover. A synthetic key fails it with a real 400 from Resend's
# API. Fixed here by pointing `RESEND_BASE_URL` (an env override the SDK
# itself reads — confirmed in `resend` package source,
# `node_modules/resend/dist/index.mjs`: `process.env.RESEND_BASE_URL ||
# defaultBaseUrl`) at a throwaway Caddy container that answers any request
# with `{"data":[],"error":null}`, so verifyTransport succeeds without any
# real Resend account or network egress.
# Do not route a live secret through this script; its output is pasted
# into a plan summary.

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="$REPO_ROOT/infra/docker/docker-compose.prod.yml"
PROJECT_NAME="resto-rehearsal"
# Must match docker-compose.prod.yml's caddy volume mount (`./certs`,
# resolved relative to infra/docker/) exactly — a differently-named
# directory here left Caddy crash-looping on "no such file or directory"
# the first time this ran, because the compose file's own bind mount then
# auto-vivified an empty infra/docker/certs/ instead of finding these.
# Gitignored (.gitignore) precisely because plan 08 puts the real Origin
# CA private key at this same path on the box.
CERT_DIR="$REPO_ROOT/infra/docker/certs"
COMPOSE_ENV_FILE="$REPO_ROOT/infra/docker/.env.rehearsal"
ENV_API_FILE="$REPO_ROOT/infra/docker/.env.api"
ENV_WEBSITE_FILE="$REPO_ROOT/infra/docker/.env.website"
MOCK_DIR="$(mktemp -d)"
MOCK_CADDYFILE="$MOCK_DIR/Caddyfile"
MOCK_COMPOSE_FILE="$MOCK_DIR/resend-mock.compose.yml"
RESULT_FILE="$(mktemp)"

# Three distinct reserved apexes (RFC 2606 .invalid — unroutable, and unlike
# `localhost` not matched by EPHEMERAL_HOST_RE, confirmed by hand:
# `node -e "...EPHEMERAL_HOST_RE.test('example.invalid')"` -> false, same
# for admin.invalid / guest.invalid) so the rehearsal exercises the same
# three-parameter shape production uses.
PUBLIC_APEX_DOMAIN="example.invalid"
ADMIN_APEX_DOMAIN="admin.invalid"
GUEST_APEX_DOMAIN="guest.invalid"

POSTGRES_ADMIN_USER="resto_admin"
POSTGRES_ADMIN_PASSWORD="rehearsal_admin_pwd_local_only"
POSTGRES_DB="resto_rehearsal"
NATS_USERNAME="rehearsal_nats_user"
NATS_PASSWORD="rehearsal_nats_pwd_local_only"
APP_ROLE_PASSWORD="RehearsalAppRolePwd12345678"
AUTH_ROLE_PASSWORD="RehearsalAuthRolePwd12345678"

cleanup() {
  local status=$?
  echo "local-prod-rehearsal.sh: tearing down (project $PROJECT_NAME)" >&2
  # Long way round, deliberately: no `down`, no `-v`. This script ships
  # beside assert-no-destructive-compose.sh and must conform to the same
  # guard it asserts elsewhere, not merely be exempt from it.
  docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" -f "$MOCK_COMPOSE_FILE" stop >/dev/null 2>&1 || true
  docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" -f "$MOCK_COMPOSE_FILE" rm -f >/dev/null 2>&1 || true
  docker volume rm "${PROJECT_NAME}_postgres-data" "${PROJECT_NAME}_nats-data" "${PROJECT_NAME}_caddy-data" >/dev/null 2>&1 || true
  rm -f "$COMPOSE_ENV_FILE" "$ENV_API_FILE" "$ENV_WEBSITE_FILE" "$RESULT_FILE"
  rm -rf "$CERT_DIR" "$MOCK_DIR"
  exit "$status"
}
trap cleanup EXIT

echo "=== local-prod-rehearsal.sh: constructor-inertness check ===" | tee -a "$RESULT_FILE"
(
  cd "$REPO_ROOT/apps/api"
  START_MS=$(($(date +%s%N) / 1000000))
  node --input-type=module -e "const {Resend}=await import('resend');const S=(await import('stripe')).default;new Resend('re_rehearsal_local_only');new S('sk_test_rehearsal_local_only');console.log('constructors inert')"
  END_MS=$(($(date +%s%N) / 1000000))
  echo "constructor-inertness: $((END_MS - START_MS))ms, no network"
) | tee -a "$RESULT_FILE"

echo "=== local-prod-rehearsal.sh: self-signed origin cert (Origin CA is a plan-08 artifact) ===" | tee -a "$RESULT_FILE"
mkdir -p "$CERT_DIR"
openssl req -x509 -newkey rsa:2048 -keyout "$CERT_DIR/origin.key" -out "$CERT_DIR/origin.crt" \
  -days 1 -nodes -subj "/CN=api.${PUBLIC_APEX_DOMAIN}" \
  -addext "subjectAltName=DNS:api.${PUBLIC_APEX_DOMAIN},DNS:${PUBLIC_APEX_DOMAIN},DNS:*.${PUBLIC_APEX_DOMAIN}" \
  >>"$RESULT_FILE" 2>&1

cat >"$COMPOSE_ENV_FILE" <<ENV
PUBLIC_APEX_DOMAIN=${PUBLIC_APEX_DOMAIN}
ADMIN_APEX_DOMAIN=${ADMIN_APEX_DOMAIN}
GUEST_APEX_DOMAIN=${GUEST_APEX_DOMAIN}
GHCR_OWNER=local
API_IMAGE_TAG=rehearsal
WEBSITE_IMAGE_TAG=rehearsal
API_HOST=api.${PUBLIC_APEX_DOMAIN}
WEBSITE_HOST=${PUBLIC_APEX_DOMAIN}
INTERNAL_ALLOWED_IPS=192.0.2.1/32
POSTGRES_ADMIN_USER=${POSTGRES_ADMIN_USER}
POSTGRES_ADMIN_PASSWORD=${POSTGRES_ADMIN_PASSWORD}
POSTGRES_DB=${POSTGRES_DB}
NATS_USERNAME=${NATS_USERNAME}
NATS_PASSWORD=${NATS_PASSWORD}
ENV

# assertProdGuardrails demands non-dev-default values on all of these
# outside NODE_ENV=development/test. S3 cannot be local MinIO here: the
# guard rejects a loopback S3_ENDPOINT, and nothing touches S3 during
# boot, so a synthetic unreachable endpoint is correct, not a fudge.
cat >"$ENV_API_FILE" <<ENV
NODE_ENV=production
API_PORT=3000
OTEL_DISABLED=true

DATABASE_URL=postgresql://resto_app:${APP_ROLE_PASSWORD}@postgres:5432/${POSTGRES_DB}
DATABASE_DIRECT_URL=postgresql://resto_app:${APP_ROLE_PASSWORD}@postgres:5432/${POSTGRES_DB}
BETTER_AUTH_DATABASE_URL=postgresql://resto_auth:${AUTH_ROLE_PASSWORD}@postgres:5432/${POSTGRES_DB}

BETTER_AUTH_SECRET=rehearsal_only_better_auth_secret_32_chars_min_xyz
BETTER_AUTH_BASE_URL=https://api.${PUBLIC_APEX_DOMAIN}
AUDIT_ERASURE_SALT=rehearsal_only_audit_erasure_salt_32_chars_min_xyz
INTERNAL_API_TOKEN=rehearsal_internal_token_16plus

NATS_URL=nats://nats:4222
NATS_USERNAME=${NATS_USERNAME}
NATS_PASSWORD=${NATS_PASSWORD}

S3_ENDPOINT=https://s3.${PUBLIC_APEX_DOMAIN}
S3_ACCESS_KEY=rehearsal_s3_access_key
S3_SECRET_KEY=rehearsal_s3_secret_key
S3_REGION=auto
S3_BUCKET=resto-rehearsal
MEDIA_PUBLIC_BASE_URL=https://media.${PUBLIC_APEX_DOMAIN}

# See the file header: verifyTransport() calls the real domains.list()
# endpoint even with a syntactically-valid dummy key. RESEND_BASE_URL is
# the SDK's own documented env override, redirected at the resend-mock
# compose service this script also defines.
RESEND_BASE_URL=http://resend-mock:8080

RESEND_API_KEY=re_rehearsal_local_only
RESEND_FROM="RestOS <noreply@${PUBLIC_APEX_DOMAIN}>"
RESEND_REPLY_TO=support@${PUBLIC_APEX_DOMAIN}

STRIPE_SECRET_KEY=sk_test_rehearsal_local_only
STRIPE_WEBHOOK_SECRET=whsec_rehearsal_local_only
STRIPE_CONNECT_CLIENT_ID=ca_rehearsal_local_only
STRIPE_CONNECT_RETURN_URL=https://${ADMIN_APEX_DOMAIN}/stripe/return
STRIPE_CONNECT_REFRESH_URL=https://${ADMIN_APEX_DOMAIN}/stripe/refresh

# Docker bridge only — there is no Cloudflare hop locally. Production
# additionally needs Cloudflare's ranges (api.env.example); do not copy
# this narrower value onto the box.
TRUST_PROXY=172.16.0.0/12

AUTH_COOKIE_DOMAIN=.${ADMIN_APEX_DOMAIN}
ADMIN_WEB_URL=https://${ADMIN_APEX_DOMAIN}
ADMIN_WEB_ORIGIN_WILDCARD=https://*.${ADMIN_APEX_DOMAIN}
WEBSITE_PUBLIC_URL=https://${PUBLIC_APEX_DOMAIN}
PUBLIC_APEX_DOMAIN=${PUBLIC_APEX_DOMAIN}
GUEST_APEX_DOMAIN=${GUEST_APEX_DOMAIN}

CORS_ALLOWED_ORIGINS=https://${PUBLIC_APEX_DOMAIN},https://*.${PUBLIC_APEX_DOMAIN}
ENV
chmod 600 "$ENV_API_FILE"

cat >"$ENV_WEBSITE_FILE" <<ENV
NODE_ENV=production
DEPLOYMENT_ENVIRONMENT=production
NEXT_PUBLIC_API_ORIGIN=https://api.${PUBLIC_APEX_DOMAIN}
WEBSITE_URL=https://${PUBLIC_APEX_DOMAIN}
ENV
chmod 600 "$ENV_WEBSITE_FILE"

echo "=== local-prod-rehearsal.sh: hostname-depth check on the rendered env ===" | tee -a "$RESULT_FILE"
PUBLIC_APEX_DOMAIN="$PUBLIC_APEX_DOMAIN" ADMIN_APEX_DOMAIN="$ADMIN_APEX_DOMAIN" GUEST_APEX_DOMAIN="$GUEST_APEX_DOMAIN" \
  bash "$REPO_ROOT/infra/scripts/assert-hostname-depth.sh" "$ENV_API_FILE" | tee -a "$RESULT_FILE"

cat >"$MOCK_CADDYFILE" <<'CADDY'
:8080 {
	respond `{"data":[],"error":null}` 200
}
CADDY
cat >"$MOCK_COMPOSE_FILE" <<COMPOSE
services:
  resend-mock:
    image: caddy:2.11-alpine
    restart: unless-stopped
    volumes:
      - ${MOCK_CADDYFILE}:/etc/caddy/Caddyfile:ro
COMPOSE

echo "=== local-prod-rehearsal.sh: building api + migrate images ===" | tee -a "$RESULT_FILE"
docker build -f "$REPO_ROOT/apps/api/Dockerfile" --target runtime -t "ghcr.io/local/resto-api:rehearsal" "$REPO_ROOT" | tail -5
docker build -f "$REPO_ROOT/apps/api/Dockerfile" --target migrate -t "ghcr.io/local/resto-migrate:rehearsal" "$REPO_ROOT" | tail -5

echo "=== local-prod-rehearsal.sh: up -d postgres nats resend-mock ===" | tee -a "$RESULT_FILE"
docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" -f "$MOCK_COMPOSE_FILE" --env-file "$COMPOSE_ENV_FILE" up -d postgres nats resend-mock

for _ in $(seq 1 30); do
  PG_STATUS="$(docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" -f "$MOCK_COMPOSE_FILE" --env-file "$COMPOSE_ENV_FILE" ps postgres --format json | python3 -c "import json,sys; print(json.load(sys.stdin).get('Health','unknown'))" 2>/dev/null || echo unknown)"
  [ "$PG_STATUS" = "healthy" ] && break
  sleep 1
done
[ "$PG_STATUS" = "healthy" ] || {
  echo "local-prod-rehearsal.sh: FAILED — postgres did not become healthy" >&2
  docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" logs postgres >&2
  exit 1
}

echo "=== local-prod-rehearsal.sh: migrate (db:migrate) ===" | tee -a "$RESULT_FILE"
docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" -f "$MOCK_COMPOSE_FILE" --env-file "$COMPOSE_ENV_FILE" run --rm \
  -e "DATABASE_ADMIN_URL=postgresql://${POSTGRES_ADMIN_USER}:${POSTGRES_ADMIN_PASSWORD}@postgres:5432/${POSTGRES_DB}" \
  migrate /workspace/node_modules/.bin/tsx src/cli/migrate.ts

echo "=== local-prod-rehearsal.sh: provision-roles-ci.ts (ci.yml order: migrations first) ===" | tee -a "$RESULT_FILE"
docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" -f "$MOCK_COMPOSE_FILE" --env-file "$COMPOSE_ENV_FILE" run --rm \
  -e "DATABASE_ADMIN_URL=postgresql://${POSTGRES_ADMIN_USER}:${POSTGRES_ADMIN_PASSWORD}@postgres:5432/${POSTGRES_DB}" \
  -e "APP_ROLE_PASSWORD=${APP_ROLE_PASSWORD}" \
  -e "AUTH_ROLE_PASSWORD=${AUTH_ROLE_PASSWORD}" \
  migrate /workspace/node_modules/.bin/tsx src/cli/provision-roles-ci.ts

echo "=== local-prod-rehearsal.sh: up -d --no-deps api caddy (website image is not built by this plan) ===" | tee -a "$RESULT_FILE"
docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" -f "$MOCK_COMPOSE_FILE" --env-file "$COMPOSE_ENV_FILE" up -d --no-deps api caddy

echo "=== local-prod-rehearsal.sh: waiting for api to report healthy ===" | tee -a "$RESULT_FILE"
API_CID="$(docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" -f "$MOCK_COMPOSE_FILE" --env-file "$COMPOSE_ENV_FILE" ps -q api)"
for _ in $(seq 1 30); do
  API_STATUS="$(docker inspect --format '{{.State.Health.Status}}' "$API_CID" 2>/dev/null || echo unknown)"
  [ "$API_STATUS" = "healthy" ] && break
  sleep 2
done
if [ "$API_STATUS" != "healthy" ]; then
  echo "local-prod-rehearsal.sh: FAILED — api did not become healthy (status=$API_STATUS)" >&2
  docker logs "$API_CID" >&2
  exit 1
fi
echo "api healthy" | tee -a "$RESULT_FILE"

echo "=== local-prod-rehearsal.sh: Caddy Host-routed /healthz and /readyz through TLS ===" | tee -a "$RESULT_FILE"
HEALTHZ_CODE="$(curl -sk -o /dev/null -w '%{http_code}' --resolve "api.${PUBLIC_APEX_DOMAIN}:443:127.0.0.1" "https://api.${PUBLIC_APEX_DOMAIN}/healthz")"
[ "$HEALTHZ_CODE" = "200" ] || {
  echo "local-prod-rehearsal.sh: FAILED — /healthz through Caddy returned $HEALTHZ_CODE" >&2
  exit 1
}
echo "/healthz via Caddy Host routing + TLS: 200" | tee -a "$RESULT_FILE"

READYZ_BODY="$(curl -sk --resolve "api.${PUBLIC_APEX_DOMAIN}:443:127.0.0.1" "https://api.${PUBLIC_APEX_DOMAIN}/readyz")"
echo "$READYZ_BODY" | grep -q 'outbox_leader' || {
  echo "local-prod-rehearsal.sh: FAILED — /readyz did not report outbox_leader state: $READYZ_BODY" >&2
  exit 1
}
echo "/readyz reports outbox_leader state: $READYZ_BODY" | tee -a "$RESULT_FILE"

echo "=== local-prod-rehearsal.sh: backup (BACKUP_LOCAL_ONLY=1) ===" | tee -a "$RESULT_FILE"
BACKUP_DIR="$(mktemp -d)"
BACKUP_OUT="$(BACKUP_DIR="$BACKUP_DIR" COMPOSE_PROJECT_NAME="$PROJECT_NAME" BACKUP_LOCAL_ONLY=1 \
  bash "$REPO_ROOT/infra/scripts/backup-nightly.sh")"
echo "$BACKUP_OUT" | tee -a "$RESULT_FILE"
DUMP_GZ="$(ls "$BACKUP_DIR"/*.dump.gz)"

echo "=== local-prod-rehearsal.sh: restore drill ===" | tee -a "$RESULT_FILE"
DRILL_OUT="$(APP_ROLE_PASSWORD="$APP_ROLE_PASSWORD" AUTH_ROLE_PASSWORD="$AUTH_ROLE_PASSWORD" \
  bash "$REPO_ROOT/infra/scripts/restore-drill.sh" --dump-file "$DUMP_GZ")"
echo "$DRILL_OUT" | tee -a "$RESULT_FILE"
echo "$DRILL_OUT" | grep -q '^restore-drill.sh: PASSED' || {
  echo "local-prod-rehearsal.sh: FAILED — restore drill did not pass" >&2
  exit 1
}

rm -rf "$BACKUP_DIR"

echo "=== local-prod-rehearsal.sh: guard re-check over its own deliverables ===" | tee -a "$RESULT_FILE"
bash "$REPO_ROOT/infra/scripts/assert-no-destructive-compose.sh"

echo "local-prod-rehearsal.sh: PASSED" | tee -a "$RESULT_FILE"
cp "$RESULT_FILE" /tmp/local-prod-rehearsal-last-run.log
