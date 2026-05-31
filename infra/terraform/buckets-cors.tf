# Phase 4b D-4b-07: production bucket CORS for admin direct-PUT photo upload (CAT-03).
#
# Apply via `terraform apply` after Phase 4b ships and the production bucket
# (AWS S3 / Cloudflare R2) is provisioned. The dev parity lives in
# infra/docker/minio-init.sh + the `MINIO_API_CORS_ALLOW_ORIGIN` env on the
# minio service in infra/docker/docker-compose.dev.yml.
#
# STUB STATUS: This file is a stub. The full Terraform tree (provider config,
# backend state, bucket resource, IAM/IRSA, KMS) ships in the production infra
# phase. Surfacing the rule here keeps the CORS contract reviewed and
# version-controlled alongside the application code that depends on it.
#
# Threat-model linkage:
#   - T-04b-03-06 (Info Disclosure: CORS leaking bucket to attacker origin):
#     allowed_origins is a single tenant-trusted admin URL — never `*`.
#   - T-04b-03-07 (Repudiation: CORS not applied in prod):
#     this file + the user_setup checklist on 04b-03-PLAN.md surface the
#     manual apply step to the deployer.
#
# Cross-references:
#   - apps/api: S3SignedImageUrlAdapter.presignPut (commit 638081a)
#   - apps/api: POST /internal/v1/catalog/photo-upload-url (commit 5811fe3)
#   - infra/docker: MinIO dev CORS posture (commit 2ca8675)
#   - .planning/phases/04b-catalog-admin-ui/04B-RESEARCH.md §Pitfall #2

variable "admin_web_url" {
  description = "Admin app origin URL — must match ADMIN_WEB_URL env on the api. Example: https://admin.resto.app. Never use a wildcard."
  type        = string
}

variable "menu_photos_bucket_name" {
  description = "Name of the production menu-photos S3 bucket (declared by the bucket resource shipped in the production infra phase)."
  type        = string
}

# AWS S3 production CORS rule.
#
# When the production bucket resource lands (production infra phase), reference
# its name via `aws_s3_bucket.menu_photos.id` instead of the
# `menu_photos_bucket_name` variable. The variable indirection keeps this stub
# self-contained until then.
#
# Cloudflare R2 equivalent: `cloudflare_r2_bucket_cors_configuration` (provider
# `cloudflare/cloudflare`). Mirror the same allowed_methods / allowed_origins /
# allowed_headers / expose_headers / max_age_seconds shape.
resource "aws_s3_bucket_cors_configuration" "menu_photos" {
  bucket = var.menu_photos_bucket_name

  cors_rule {
    allowed_methods = ["PUT", "GET"]
    allowed_origins = [var.admin_web_url]
    allowed_headers = ["Content-Type", "Content-Length", "x-amz-*"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3600
  }
}
