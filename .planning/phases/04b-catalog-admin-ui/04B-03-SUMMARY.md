---
phase: 04b-catalog-admin-ui
plan: 03
subsystem: catalog
tags:
  [catalog, photo-upload, presigned-url, s3, minio, cors, terraform, openapi]
dependency-graph:
  requires: [04b-02]
  provides: []
  affects:
    - apps/api/src/contexts/catalog/domain/ports.ts
    - apps/api/src/contexts/catalog/infrastructure/s3-signed-image-url.adapter.ts
    - apps/api/src/contexts/catalog/application/get-photo-upload-url.service.ts
    - apps/api/src/contexts/catalog/application/dto.ts
    - apps/api/src/contexts/catalog/interfaces/http/internal-catalog.controller.ts
    - apps/api/src/contexts/catalog/catalog.module.ts
    - apps/api/test/unit/catalog/s3-signed-image-url.adapter.spec.ts
    - apps/api/test/e2e/catalog-photo-upload.e2e.spec.ts
    - infra/docker/docker-compose.dev.yml
    - infra/docker/minio-init.sh
    - infra/terraform/buckets-cors.tf
    - docs/api/openapi.yaml
    - packages/api-client/src/generated/api.ts

tech-stack:
  added: []
  patterns:
    - 'S3 adapter `presignPut(s3Key, contentType, contentLength, ttlSeconds)` binds Content-Type + Content-Length into the SigV4 signature; PUT errors propagate (no silent fallback unlike presignGet which returns empty string for graceful image-degradation).'
    - 'Photo upload uses server-chosen s3Key `tenant/${tenantId}/menu-items/${randomUUID()}.{ext}` — operator never supplies a key (Tampering mitigation T-04b-03-02).'
    - 'Server-side allowlist enforced at presign time via Zod: contentType ∈ {image/jpeg, image/png, image/webp}, sizeBytes ≤ 5_242_880 (5 MiB) — paired with SigV4 binding so S3 rejects the PUT if browser tries to upload different bytes (T-04b-03-05).'
    - 'TTL on presigned PUT URL is 300 seconds (5 minutes) — short-lived per OWASP V12 file-upload guidance (T-04b-03-04).'
    - 'MinIO dev CORS is configured via the server-wide `MINIO_API_CORS_ALLOW_ORIGIN` env on the minio service in docker-compose.dev.yml (CSV of allowed origins) — there is no per-bucket CORS toggle in MinIO. Production parity ships as a Terraform stub at infra/terraform/buckets-cors.tf.'

key-files:
  created:
    - apps/api/src/contexts/catalog/application/get-photo-upload-url.service.ts
    - apps/api/test/unit/catalog/s3-signed-image-url.adapter.spec.ts
    - apps/api/test/e2e/catalog-photo-upload.e2e.spec.ts
    - infra/terraform/buckets-cors.tf
    - .planning/phases/04b-catalog-admin-ui/04B-03-SUMMARY.md
  modified:
    - apps/api/src/contexts/catalog/domain/ports.ts
    - apps/api/src/contexts/catalog/infrastructure/s3-signed-image-url.adapter.ts
    - apps/api/src/contexts/catalog/application/dto.ts
    - apps/api/src/contexts/catalog/interfaces/http/internal-catalog.controller.ts
    - apps/api/src/contexts/catalog/catalog.module.ts
    - infra/docker/docker-compose.dev.yml
    - infra/docker/minio-init.sh
    - docs/api/openapi.yaml
    - packages/api-client/src/generated/api.ts

key-decisions:
  - "Task 4 (manual browser smoke probe) DEFERRED to Plan 04b-07 (photo-upload-client) rather than executed inline. Rationale: the e2e suite (7/7) already validates the presigned-URL contract end-to-end against a real MinIO container (PUT bytes, contentType allowlist, 5 MiB cap, zero-size rejection, missing INTERNAL_API_TOKEN, cross-tenant key scoping); `curl OPTIONS` CORS preflight from allowed origin returned 204 with correct Access-Control-* headers and was denied from a disallowed origin; the first *real-browser* PUT happens naturally in Plan 04b-07 when the `photo-upload-client.tsx` component lands, which is the right place to catch any browser-specific SigV4 binding mismatch that didn't surface in curl. Operator decision recorded at checkpoint."
  - 'presignPut error handling intentionally diverges from presignGet: PUT failures propagate, GET failures swallow-and-return-empty. Rationale — GET is on a read-side hot path (cold-cache published menu); silently degraded image URL is preferable to a 5xx that hides the entire menu. PUT is on the write path where the operator MUST see the failure to retry — silent fallback to `""` here would leave the operator staring at a "saved" indicator over an empty s3Key.'
  - 'TTL ≤ 600s defense at the adapter layer: if a caller ever passes `ttlSeconds > 600` to `presignPut`, the adapter logs a warn but still honors the call. The Zod-validated controller path always passes 300s; the warn fires only if a future caller bypasses the service. Pragmatic — warn-not-throw avoids breaking the build if a test fixture uses a longer TTL, but the production hot path is policed at the input edge.'
  - 'MinIO server-wide env vs per-bucket CORS: MinIO has no per-bucket CORS API — the only knob is `MINIO_API_CORS_ALLOW_ORIGIN` (CSV) on the minio service. We documented the posture in the init script even though no `mc` CLI call is actually needed for the CORS bits, so the script stays the single source-of-truth for "what does dev MinIO look like".'
  - 'Terraform tree is currently a stub (.gitkeep only). buckets-cors.tf ships as a self-contained stub with variable indirection (`var.menu_photos_bucket_name`) rather than referencing a not-yet-existing `aws_s3_bucket.menu_photos.id` — when the production infra phase lands, the maintainer flips one line.'

patterns-established:
  - 'Presigned-PUT contract: `{ contentType, sizeBytes } -> { uploadUrl, s3Key }`. Server owns the key; client receives only a single-use URL + the key to reference in the subsequent item-save mutation.'
  - 'Server-only mutations rule: photo-upload-url is registered on the internal-catalog.controller and gated by InternalTokenGuard — admin server actions call it via apiFetchInternal, never from the browser.'
  - "Cross-tenant scope test as a baseline for every new internal endpoint: e2e spec asserts a token+tenant-context for tenant A cannot generate a key prefixed with tenant B's id. The pattern is now in catalog-photo-upload.e2e.spec.ts and should be copy-paste-ready for future internal endpoints touching tenant-scoped resources."

requirements-completed: [CAT-03]

# Metrics
duration: ~50min (Tasks 1-3) + ~5min (Task 5 stub)
completed: 2026-05-31
---

# Phase 04b Plan 03: Wave 2 Backend Addendum Summary

**S3 `presignPut` + `POST /internal/v1/catalog/photo-upload-url` + MinIO dev CORS + production Terraform stub — the backend that lets the Plan 07 photo-upload-client direct-PUT a JPEG/PNG/WebP into a tenant-scoped key without proxying bytes through the api.**

## Performance

- **Duration:** ~55 min total across two sessions (Tasks 1-3 in the first executor pass; Task 5 stub + SUMMARY in this resume pass)
- **Started:** 2026-05-31 ~14:35Z (Task 1)
- **Completed:** 2026-05-31T16:33:00Z (Task 5 + SUMMARY)
- **Tasks:** 4 source-code tasks executed (1, 2, 3, 5) + 1 deferred (Task 4 — see Deviations)
- **Files modified:** 14 (5 created, 9 modified)

## Accomplishments

- **`ImageUrlPort` extension + `S3SignedImageUrlAdapter.presignPut`** — the adapter mirrors `presignGet`'s SDK call shape but uses `PutObjectCommand` with `ContentType` + `ContentLength` so AWS SigV4 binds those headers into the signature. PUT errors propagate (RuntimeError → caller); no silent fallback. TTL > 600s logs a warn-defense.
- **`POST /internal/v1/catalog/photo-upload-url`** — Zod-validated `{ contentType ∈ {jpeg,png,webp}, sizeBytes ≤ 5 MiB } -> { uploadUrl, s3Key }`. s3Key is server-chosen `tenant/${tenantId}/menu-items/${randomUUID()}.{ext}`. TTL constant `300s`. Endpoint inherits InternalTokenGuard from the controller class.
- **MinIO dev CORS** — `MINIO_API_CORS_ALLOW_ORIGIN` env on the minio service in docker-compose.dev.yml (default `http://localhost:3000,http://localhost:3003`), plus a documentation-only block in `infra/docker/minio-init.sh` explaining the posture (there is no per-bucket CORS API in MinIO — the env var is the single knob).
- **Production Terraform stub** at `infra/terraform/buckets-cors.tf` — `aws_s3_bucket_cors_configuration.menu_photos` with `allowed_methods = ["PUT", "GET"]`, `allowed_origins = [var.admin_web_url]`, `allowed_headers = ["Content-Type", "Content-Length", "x-amz-*"]`, `expose_headers = ["ETag"]`, `max_age_seconds = 3600`. Apply gated on the production infra phase per the plan's `user_setup` checklist.
- **OpenAPI regen + drift gate green** — `docs/api/openapi.yaml` and `packages/api-client/src/generated/api.ts` updated; `pnpm openapi:check` clean (no drift between the live NestJS schema and the committed artifacts).
- **e2e contract coverage (7/7 passing against a real MinIO container)** — valid request returns 200 + tenant-prefixed s3Key; allowlist enforces image/jpeg, image/png, image/webp (application/pdf is 400); 5 MiB cap enforced; zero/negative sizeBytes 400; missing INTERNAL_API_TOKEN 401; cross-tenant scope test asserts tenant A cannot produce a key under tenant B's prefix.

## Task Commits

Each task was committed atomically on `main`:

1. **Task 1: Extend `S3SignedImageUrlAdapter` with `presignPut` + `ImageUrlPort` extension** — `638081a` (feat) — TDD: unit spec drives the adapter shape with a mocked SDK client.
2. **Task 2: Application service + DTO + controller endpoint for `POST /photo-upload-url`** — `5811fe3` (feat) — TDD: e2e spec asserts the contract end-to-end against MinIO.
3. **Task 3: MinIO dev bucket CORS for PUT from admin origin** — `2ca8675` (chore) — `MINIO_API_CORS_ALLOW_ORIGIN` env + `infra/docker/minio-init.sh` posture documentation.
4. **Task 4: Manual MinIO upload smoke probe** — **DEFERRED to Plan 04b-07** (see Deviations from Plan).
5. **Task 5: Terraform stub for production bucket CORS** — `783d678` (chore) — `infra/terraform/buckets-cors.tf` self-contained stub with `var.admin_web_url` + `var.menu_photos_bucket_name` indirection until the production infra phase ships the bucket resource.

**Plan metadata:** to be created with the SUMMARY commit (`docs(04b): summary 03`).

## Files Created/Modified

### Created

- `apps/api/src/contexts/catalog/application/get-photo-upload-url.service.ts` — `@Injectable()` service; injects `IMAGE_URL_PORT`; pulls tenant context via `requireTenantContext()`; generates `tenant/${tenantId}/menu-items/${randomUUID()}.{ext}` then calls `images.presignPut(s3Key, contentType, sizeBytes, 300)`.
- `apps/api/test/unit/catalog/s3-signed-image-url.adapter.spec.ts` — Vitest spec; asserts `presignPut` calls `getSignedUrl` with `PutObjectCommand({ Bucket, Key, ContentType, ContentLength })` and `{ expiresIn: ttlSeconds }`.
- `apps/api/test/e2e/catalog-photo-upload.e2e.spec.ts` — 7 e2e tests against a real MinIO container (docker-detected; skips with `describe.skip` when Docker is unavailable). See coverage list in Accomplishments.
- `infra/terraform/buckets-cors.tf` — production CORS stub (PUT + GET from admin origin only, no wildcard). Comment header documents threat-model linkage (T-04b-03-06, T-04b-03-07) and cross-references the prior 3 commits.
- `.planning/phases/04b-catalog-admin-ui/04B-03-SUMMARY.md` — this file.

### Modified

- `apps/api/src/contexts/catalog/domain/ports.ts` — `ImageUrlPort` interface adds `presignPut(s3Key, contentType, contentLength, ttlSeconds): Promise<string>` alongside the existing `presignGet`.
- `apps/api/src/contexts/catalog/infrastructure/s3-signed-image-url.adapter.ts` — adds `PutObjectCommand` import + `presignPut` method. PUT errors propagate (no try/catch swallow). Warn-log when `ttlSeconds > 600`.
- `apps/api/src/contexts/catalog/application/dto.ts` — `PhotoUploadUrlInputSchema` (enum contentType + bounded sizeBytes) + `PhotoUploadUrlResponseSchema` (url + non-empty s3Key) + `createZodDto` wrappers.
- `apps/api/src/contexts/catalog/interfaces/http/internal-catalog.controller.ts` — adds `@Post('photo-upload-url')` + `@HttpCode(200)` + `@ApiBody/@ApiOkResponse` + body validation via `RestoZodValidationPipe(PhotoUploadUrlInputDto)`. Wraps the service call via the existing `wrap()` helper.
- `apps/api/src/contexts/catalog/catalog.module.ts` — `GetPhotoUploadUrlService` added to `providers`.
- `infra/docker/docker-compose.dev.yml` — `MINIO_API_CORS_ALLOW_ORIGIN` env on the minio service; CSV defaults `http://localhost:3000,http://localhost:3003`; overrideable via host env.
- `infra/docker/minio-init.sh` — documentation block describing the CORS posture (`AllowedMethods`, `AllowedOrigins`, `AllowedHeaders`, `ExposeHeaders`, `MaxAgeSeconds`).
- `docs/api/openapi.yaml` + `packages/api-client/src/generated/api.ts` — regenerated via `pnpm openapi:check` (drift gate green).

## Decisions Made

See `key-decisions` in frontmatter. Top three:

1. **Task 4 DEFERRED to Plan 04b-07** — operator decision at checkpoint, recorded with rationale below.
2. **`presignPut` error handling diverges from `presignGet`** — propagate vs. swallow, intentional asymmetry between write- and read-path UX.
3. **TTL ≤ 600s is a warn-defense at the adapter, not a throw** — the controller already polices the input edge to 300s; the adapter warn covers future callers that bypass the service.

## Deviations from Plan

### 1. Task 4 — Manual MinIO upload smoke probe — DEFERRED (not failed, not skipped)

- **Plan reference:** `<task type="checkpoint:human-verify" gate="blocking">` in 04b-03-PLAN.md (Task 4).
- **What the checkpoint asked for:** Operator runs a 6-step browser-side PUT smoke probe — curl the `/photo-upload-url` endpoint, copy the `uploadUrl`, then in DevTools at `http://localhost:3000` run `fetch(uploadUrl, { method: 'PUT', body, headers })` and confirm 200 + object visible in the MinIO console.
- **Operator decision:** Skip the manual browser probe; let the natural first-PUT happen in Plan 04b-07 (Task building `photo-upload-client.tsx`).
- **Why the deferral is safe:**
  - The e2e suite (`apps/api/test/e2e/catalog-photo-upload.e2e.spec.ts`) runs the full request → presigned-URL → PUT → object-exists round-trip against a real MinIO container. 7/7 pass and they cover the contract the manual probe was meant to validate: valid PUT, contentType allowlist, 5 MiB cap, zero-size rejection, missing INTERNAL_API_TOKEN, cross-tenant key scoping.
  - `curl -X OPTIONS` CORS preflight from `Origin: http://localhost:3000` against MinIO returned 204 with the expected `Access-Control-Allow-Origin: http://localhost:3000`, `Access-Control-Allow-Methods: GET, PUT`, `Access-Control-Allow-Headers: Content-Type, Content-Length, x-amz-*`, `Access-Control-Max-Age: 3600` headers. The same request from `Origin: https://evil.example` was denied.
  - The remaining risk surface — a _browser-specific_ SigV4 binding mismatch (browser auto-adds headers curl doesn't) — only surfaces when a real `fetch(uploadUrl, { method: 'PUT', body: blob })` runs. That first browser PUT happens naturally as part of Plan 04b-07 (`photo-upload-client.tsx`). Pulling the human into a curl-then-DevTools loop here is wasted operator time; the natural verification site is one plan away.
- **Follow-up site:** Plan 04b-07 — `photo-upload-client.tsx` build will exercise the browser path. If a SigV4 / Content-Type mismatch surfaces, the fix lands there (probably in the client's `fetch` headers or, if it turns out to be an adapter issue, here).
- **Tracking marker:** This deviation is recorded here under `## Deviations from Plan` _and_ in the SUMMARY frontmatter `key-decisions`. The phase verifier should see the deferral and confirm Plan 04b-07 closes it.

---

**Total deviations:** 1 (Task 4 deferred to Plan 04b-07 — operator-approved, with e2e + curl-preflight evidence covering the contract).
**Impact on plan:** No scope creep. The plan's behavioral acceptance criteria (success_criteria #1-#7 in PLAN.md) are all met by Tasks 1-3 + 5 plus the e2e suite. Task 4 was a "verify the dev posture with a real browser" probe; the real-browser verification just moves one plan downstream where it has a natural home.

## Issues Encountered

- **`@aws-sdk/s3-request-presigner` v3 + `PutObjectCommand` content-length binding**: documented but easy to miss — the `ContentLength` must be passed to `PutObjectCommand` _at presign time_ (not just to the browser as a header) for SigV4 to include it in the signature. Initial spec used only `ContentType`; the test caught the missing `ContentLength` assertion and the adapter was fixed before the first commit landed. No code went out without it.
- **MinIO has no per-bucket CORS API** (vs. AWS S3 / R2 which do) — discovered during Task 3 exploration. Resolved by configuring `MINIO_API_CORS_ALLOW_ORIGIN` at the server level and documenting the posture in `minio-init.sh` so a future contributor reading the init script knows where the CORS knob actually lives.
- **No build / lint regressions introduced by 04b-03.** Pre-existing lint issues on `main` (resend.adapter.ts, cross-tenant-nats-mix.e2e.spec.ts, gdpr-retention.e2e.spec.ts) were left untouched and recorded in `deferred-items.md` during the first session.

## User Setup Required

**1 production action surfaced by `user_setup` frontmatter on 04b-03-PLAN.md:**

- **Service:** AWS S3 / Cloudflare R2 (production)
- **Why:** the production photo-upload bucket must allow PUT from the admin production origin so browser direct-PUT works in prod.
- **Where:** AWS S3 / R2 console → bucket → Permissions → CORS — apply the rule defined in `infra/terraform/buckets-cors.tf`. Either `terraform apply` (once the production Terraform tree lands the bucket resource) or manual configuration in the console using the same CORS-rule values.

No dev-side action required — `pnpm dev:up` already brings up MinIO with the right CORS posture from `docker-compose.dev.yml`.

## Next Phase Readiness

- **Plan 04b-07 (photo-upload-client.tsx) is unblocked.** It can call the new `POST /internal/v1/catalog/photo-upload-url` endpoint via `apiFetchInternal`, receive `{ uploadUrl, s3Key }`, and `fetch(uploadUrl, { method: 'PUT', body: blob, headers: { 'content-type': blob.type } })` directly to MinIO (dev) or S3 / R2 (prod) — bypassing the api for the byte transfer.
- **Plan 04b-07 owns the deferred browser smoke** — recommend the plan author add a single manual verification step at the end of Task building `photo-upload-client.tsx` so the operator confirms a real browser PUT works at least once on the dev stack.
- **Backend addendum for Wave 2 is closed.** Wave 3 (frontend — sidebar/layout → categories → items → modifier groups → stop-list) has every backend endpoint and contract it needs.

---

## TDD Gate Compliance

Tasks 1 and 2 used `tdd="true"`. Git history confirms the gate sequence:

- **Task 1 RED + GREEN**: combined `feat(04b): extend ImageUrlPort with presignPut` (commit `638081a`) — unit spec and adapter landed in the same commit. The spec is real (asserts `getSignedUrl` was called with the right `PutObjectCommand` shape) and would have failed without the implementation; per the plan's gate rules this is acceptable since the test does cover the new behavior. Note for future TDD strictness: separate `test(...)` and `feat(...)` commits would make the RED→GREEN cycle explicitly auditable in `git log`.
- **Task 2 RED + GREEN**: combined `feat(04b): add POST /photo-upload-url endpoint` (commit `5811fe3`) — e2e spec, service, DTO, controller, module, and OpenAPI regen all in one commit. Same caveat as Task 1.

**Recommendation for future TDD plans:** the executor should split TDD tasks into two distinct commits (`test(...)` for the failing test, then `feat(...)` for the implementation that turns it green) to make the gate sequence visible in `git log` even when it slows down the commit cadence slightly. This SUMMARY notes the deviation rather than retroactively splitting committed work.

---

## Acceptance Gate Output

- `pnpm openapi:check` — exit 0 (no drift between live NestJS schema and committed artifacts).
- `pnpm --filter @resto/api exec vitest run test/unit/catalog/s3-signed-image-url.adapter.spec.ts --no-coverage` — green.
- `pnpm --filter @resto/api exec vitest run test/e2e/catalog-photo-upload.e2e.spec.ts --no-coverage` — 7/7 green (Docker-gated; skips cleanly if Docker is absent on CI).
- Typecheck + lint green across the touched files; pre-existing lint warnings on unrelated files recorded in `deferred-items.md`.
- Plan's own verify gate for Task 5: `test -f infra/terraform/buckets-cors.tf && grep -q "allowed_methods" infra/terraform/buckets-cors.tf && grep -q "PUT" infra/terraform/buckets-cors.tf` — passes.

## Threat Surface Sweep

No new threat surface introduced beyond the `<threat_model>` register in PLAN.md (T-04b-03-01 through T-04b-03-07). All seven threats have shipped mitigations:

| Threat ID                                        | Mitigation shipped by                                         | Where                                    |
| ------------------------------------------------ | ------------------------------------------------------------- | ---------------------------------------- |
| T-04b-03-01 (SSRF via operator-supplied URL)     | presignPut returns server-generated URL                       | adapter `s3-signed-image-url.adapter.ts` |
| T-04b-03-02 (Tampering: overwrite arbitrary key) | server-chosen s3Key with tenant prefix                        | `get-photo-upload-url.service.ts`        |
| T-04b-03-03 (DoS: oversized upload)              | Zod `sizeBytes.max(5_242_880)` + SigV4 content-length binding | `dto.ts` + `presignPut` adapter call     |
| T-04b-03-04 (Replay of presigned URL)            | TTL 300s constant                                             | `GetPhotoUploadUrlService.TTL_SECONDS`   |
| T-04b-03-05 (Content-Type mismatch)              | SigV4 ContentType binding + Zod allowlist                     | adapter + `dto.ts`                       |
| T-04b-03-06 (CORS misconfiguration leaks bucket) | MinIO env + Terraform stub: explicit origin only, no wildcard | docker-compose.dev.yml + buckets-cors.tf |
| T-04b-03-07 (Bucket CORS not applied in prod)    | Terraform stub + user_setup checklist                         | buckets-cors.tf + PLAN.md user_setup     |

No `threat_flags` raised — every new surface is already in the register.

## Self-Check

Verified before the SUMMARY commit:

- `[ -f apps/api/src/contexts/catalog/application/get-photo-upload-url.service.ts ]` → FOUND
- `[ -f apps/api/test/unit/catalog/s3-signed-image-url.adapter.spec.ts ]` → FOUND
- `[ -f apps/api/test/e2e/catalog-photo-upload.e2e.spec.ts ]` → FOUND
- `[ -f infra/terraform/buckets-cors.tf ]` → FOUND
- `git log --oneline --all | grep -q "638081a"` → FOUND (Task 1)
- `git log --oneline --all | grep -q "5811fe3"` → FOUND (Task 2)
- `git log --oneline --all | grep -q "2ca8675"` → FOUND (Task 3)
- `git log --oneline --all | grep -q "783d678"` → FOUND (Task 5)

## Self-Check: PASSED

---

_Phase: 04b-catalog-admin-ui_
_Plan: 03_
_Completed: 2026-05-31_
