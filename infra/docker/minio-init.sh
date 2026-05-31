#!/usr/bin/env bash
# Phase 4b CAT-03 / D-4b-07: MinIO dev bucket bootstrap + CORS posture.
#
# Run AFTER `pnpm dev:up` brings up the MinIO container. Idempotent — safe to
# re-run; existing alias/bucket are reused.
#
# What this script does:
#   1. Registers the local MinIO alias (`mc alias set …`).
#   2. Creates the `resto-dev` bucket if absent (matches env.schema default).
#   3. Documents CORS posture: MinIO honours the server-wide env var
#      `MINIO_API_CORS_ALLOW_ORIGIN` (CSV of allowed origins) set on the
#      `minio` service in `docker-compose.dev.yml`. There is no per-bucket
#      CORS toggle in MinIO — the env var is the single knob. Production
#      (AWS S3 / Cloudflare R2) gets per-bucket CORS via Terraform:
#      `infra/terraform/buckets-cors.tf`.
#
# Why a script at all (when env vars do the work):
#   - Future-proofing: when CAT-03 grows past PUT-only (e.g. multipart
#     upload for large videos), the bucket-level config will need real `mc`
#     calls and this is the place they live.
#   - Bucket creation is order-dependent and `mc` is the canonical CLI for
#     MinIO admin work.
#
# Usage:
#   bash infra/docker/minio-init.sh
#
# Requires the `mc` binary (MinIO Client) either on the host PATH or via the
# `minio/mc:latest` image (the script falls back to docker run).
set -euo pipefail

MINIO_HOST="${MINIO_HOST:-http://localhost:9000}"
MINIO_ROOT_USER="${MINIO_ROOT_USER:-minio}"
MINIO_ROOT_PASSWORD="${MINIO_ROOT_PASSWORD:-minio_dev_password}"
BUCKET="${S3_BUCKET:-resto-dev}"
ADMIN_ORIGIN="${ADMIN_WEB_URL:-http://localhost:3000}"

# Pick mc binary: prefer host install, fall back to docker.
if command -v mc >/dev/null 2>&1; then
  MC() { mc "$@"; }
else
  echo "[minio-init] 'mc' not on PATH — falling back to 'minio/mc:latest' docker image."
  MC() {
    docker run --rm --network host -e MC_HOST_local="${MINIO_HOST/http:\/\//http://$MINIO_ROOT_USER:$MINIO_ROOT_PASSWORD@}" minio/mc:latest "$@"
  }
fi

echo "[minio-init] Registering alias 'local' → ${MINIO_HOST}"
MC alias set local "${MINIO_HOST}" "${MINIO_ROOT_USER}" "${MINIO_ROOT_PASSWORD}" >/dev/null

echo "[minio-init] Ensuring bucket '${BUCKET}' exists"
if ! MC ls "local/${BUCKET}" >/dev/null 2>&1; then
  MC mb "local/${BUCKET}"
  echo "[minio-init] Created bucket: ${BUCKET}"
else
  echo "[minio-init] Bucket already exists: ${BUCKET}"
fi

# CORS posture documentation (the actual allow-list is enforced by the
# `MINIO_API_CORS_ALLOW_ORIGIN` env var on the minio service in
# docker-compose.dev.yml — see Phase 4b CAT-03 RESEARCH.md Pitfall #2).
# AllowedMethods: PUT (presigned upload from admin), GET (presigned read
# from qr-menu). AllowedOrigins: ADMIN_WEB_URL only — no wildcard.
cat <<EOF
[minio-init] CORS posture (declared in docker-compose.dev.yml):
  AllowedMethods : PUT, GET
  AllowedOrigins : ${ADMIN_ORIGIN}
  AllowedHeaders : Content-Type, Content-Length, x-amz-*
  ExposeHeaders  : ETag
  MaxAgeSeconds  : 3600
EOF

echo "[minio-init] Done."
