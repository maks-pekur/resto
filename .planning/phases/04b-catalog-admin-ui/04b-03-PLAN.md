---
phase: 04b-catalog-admin-ui
plan: 03
type: execute
wave: 2
depends_on: ["04b-02"]
files_modified:
  - apps/api/src/contexts/catalog/domain/ports.ts
  - apps/api/src/contexts/catalog/infrastructure/s3-signed-image-url.adapter.ts
  - apps/api/src/contexts/catalog/application/get-photo-upload-url.service.ts
  - apps/api/src/contexts/catalog/application/dto.ts
  - apps/api/src/contexts/catalog/interfaces/http/internal-catalog.controller.ts
  - apps/api/src/contexts/catalog/catalog.module.ts
  - infra/docker/minio-init.sh
  - infra/terraform/buckets-cors.tf
  - docs/api/openapi.yaml
  - packages/api-client/src/generated/api.ts
autonomous: false
requirements: [CAT-03]
user_setup:
  - service: AWS S3 / Cloudflare R2 (production)
    why: "Production photo upload bucket must allow PUT from admin origin (browser direct-PUT)"
    env_vars: []
    dashboard_config:
      - task: "After Terraform stub merges, deployer applies the bucket CORS policy via terraform apply (or manually configures S3 bucket CORS in AWS console)"
        location: "AWS S3 / R2 console — bucket → Permissions → CORS"
must_haves:
  truths:
    - "S3SignedImageUrlAdapter.presignPut(key, contentType, contentLength, expiresIn) returns a presigned PUT URL"
    - "ImageUrlPort interface includes presignPut alongside presignGet"
    - "POST /internal/v1/catalog/photo-upload-url returns { uploadUrl, s3Key } for a given { contentType, sizeBytes }"
    - "Server-side allowlist: contentType ∈ {image/jpeg, image/png, image/webp}; sizeBytes ≤ 5_242_880 (5 MiB)"
    - "Presigned URL TTL ≤ 5 minutes (300s) — short-lived per OWASP V12 file upload"
    - "Generated s3Key is server-chosen UUID-prefixed; operator cannot influence (T-04b-03-03 Tampering mitigation)"
    - "MinIO dev bucket CORS allows PUT from ADMIN_WEB_URL origin (Pitfall #2)"
    - "Terraform stub for prod bucket CORS exists in infra/terraform/ — apply gated by user setup checklist"
    - "Round-trip e2e test against MinIO uploads a real file via presigned PUT and verifies the object exists"
    - "All catalog mutations (including photo-upload-url POST) go through apiFetchInternal (server-only)"
  artifacts:
    - path: "apps/api/src/contexts/catalog/infrastructure/s3-signed-image-url.adapter.ts"
      provides: "presignPut method on S3 adapter"
      contains: "presignPut"
    - path: "apps/api/src/contexts/catalog/application/get-photo-upload-url.service.ts"
      provides: "Service generating server-chosen s3Key + calling presignPut"
      exports: ["GetPhotoUploadUrlService"]
    - path: "apps/api/src/contexts/catalog/interfaces/http/internal-catalog.controller.ts"
      provides: "POST /photo-upload-url endpoint"
      contains: "@Post('photo-upload-url')"
    - path: "infra/docker/minio-init.sh"
      provides: "MinIO dev bucket CORS for PUT from admin origin"
      contains: "PUT"
    - path: "infra/terraform/buckets-cors.tf"
      provides: "Production bucket CORS Terraform stub"
      contains: "allowed_methods"
  key_links:
    - from: "internal-catalog.controller.ts"
      to: "GetPhotoUploadUrlService"
      via: "@Inject"
      pattern: "GetPhotoUploadUrlService"
    - from: "GetPhotoUploadUrlService"
      to: "ImageUrlPort.presignPut"
      via: "Symbol token injection"
      pattern: "IMAGE_URL_PORT"
    - from: "S3SignedImageUrlAdapter"
      to: "@aws-sdk/s3-request-presigner"
      via: "getSignedUrl + PutObjectCommand"
      pattern: "PutObjectCommand"
---

<objective>
Wave 2 backend addendum: extend the S3 adapter with `presignPut`, expose it on `ImageUrlPort`, wire a new `POST /internal/v1/catalog/photo-upload-url` endpoint, configure MinIO dev bucket CORS, and emit a Terraform stub for the production bucket CORS rule. CAT-03 (photo upload UX with presigned PUT) cannot ship without this.

Purpose: Existing `S3SignedImageUrlAdapter` only exposes `presignGet` (for qr-menu reading published photos). Browser direct-PUT requires `presignPut` + bucket CORS for the admin origin per RESEARCH.md Pattern 4 / Pitfall #2.

Output: 1 adapter method, 1 port extension, 1 application service, 1 controller endpoint, 1 MinIO init script change, 1 Terraform stub, regenerated OpenAPI artifacts.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/phases/04b-catalog-admin-ui/04b-CONTEXT.md
@.planning/phases/04b-catalog-admin-ui/04B-RESEARCH.md
@.planning/phases/04b-catalog-admin-ui/04B-PATTERNS.md
@.planning/phases/04b-catalog-admin-ui/04B-UI-SPEC.md
@CLAUDE.md

<interfaces>
<!-- Existing adapter to extend: apps/api/src/contexts/catalog/infrastructure/s3-signed-image-url.adapter.ts -->

Existing presignGet (lines 49-60) — mirror its error-handling shape, but DO NOT swallow PUT errors silently (PUT failure must propagate so caller can surface error to UI):
```typescript
async presignGet(s3Key: string, ttlSeconds: number): Promise<string> {
  try {
    return await getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: s3Key }),
      { expiresIn: ttlSeconds },
    );
  } catch (err) {
    this.logger.warn({ err, s3Key }, 'Failed to presign image URL — falling back to empty.');
    return '';
  }
}
```

New presignPut shape:
```typescript
async presignPut(
  s3Key: string,
  contentType: string,
  contentLength: number,
  ttlSeconds: number,
): Promise<string>;
```

Existing ImageUrlPort (apps/api/src/contexts/catalog/domain/ports.ts):
```typescript
export interface ImageUrlPort {
  presignGet(s3Key: string, ttlSeconds: number): Promise<string>;
}
```

GetPhotoUploadUrlService skeleton:
```typescript
@Injectable()
export class GetPhotoUploadUrlService {
  constructor(@Inject(IMAGE_URL_PORT) private readonly images: ImageUrlPort) {}
  async execute(input: { contentType: string; sizeBytes: number }): Promise<{ uploadUrl: string; s3Key: string }>;
}
```

Controller endpoint shape:
```typescript
@Post('photo-upload-url')
@HttpCode(HttpStatus.OK)
photoUploadUrl(@Body(new RestoZodValidationPipe(PhotoUploadUrlInputDto)) input): Promise<PhotoUploadUrlResponseDto>
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Extend S3SignedImageUrlAdapter with presignPut + ImageUrlPort interface extension</name>
  <files>apps/api/src/contexts/catalog/domain/ports.ts, apps/api/src/contexts/catalog/infrastructure/s3-signed-image-url.adapter.ts</files>
  <behavior>
    - `presignPut(s3Key, contentType, contentLength, ttlSeconds)` returns a presigned URL whose PUT must include matching Content-Type + Content-Length headers
    - PUT failures (S3 SDK errors) propagate to caller — no silent fallback to empty string (different from presignGet)
    - `ImageUrlPort` interface includes both presignGet and presignPut
    - `IMAGE_URL_PORT` symbol token unchanged
  </behavior>
  <read_first>
    - apps/api/src/contexts/catalog/infrastructure/s3-signed-image-url.adapter.ts (existing — mirror presignGet shape; add PutObjectCommand import)
    - apps/api/src/contexts/catalog/domain/ports.ts (extend ImageUrlPort)
    - .planning/phases/04b-catalog-admin-ui/04B-PATTERNS.md §Wave 2 — s3-signed-image-url.adapter.ts extend with presignPut
    - .planning/phases/04b-catalog-admin-ui/04B-RESEARCH.md §Pattern 4 (photo upload preconditions) + §Pitfall 2 (CORS + Content-Type binding)
  </read_first>
  <action>
    Add `PutObjectCommand` to the import from `@aws-sdk/client-s3` on line 1 of the adapter file (it sits next to `GetObjectCommand` already imported). Add a `presignPut(s3Key, contentType, contentLength, ttlSeconds): Promise<string>` method to `S3SignedImageUrlAdapter` mirroring the structure of `presignGet`, but using `new PutObjectCommand({ Bucket: this.bucket, Key: s3Key, ContentType: contentType, ContentLength: contentLength })`. Do NOT wrap in try/catch returning empty string — PUT errors propagate so the controller can return a 5xx and the UI shows a real error. Log at `this.logger.warn` if `ttlSeconds > 600` (defense — TTL should be ≤5min per RESEARCH.md Pattern 4 preconditions and OWASP V12).
    Extend `ImageUrlPort` in `apps/api/src/contexts/catalog/domain/ports.ts` with the matching signature.
    Tests: extend `apps/api/test/unit/catalog/s3-signed-image-url.adapter.spec.ts` (or add one) using a mocked SDK client to assert: (a) presignPut returns a non-empty URL, (b) the PutObjectCommand received Bucket, Key, ContentType, ContentLength matching inputs, (c) `getSignedUrl` was called with `expiresIn: ttlSeconds`.
  </action>
  <verify>
    <automated>pnpm --filter @resto/api exec vitest run test/unit/catalog/s3-signed-image-url.adapter.spec.ts --no-coverage</automated>
  </verify>
  <done>
    presignPut method exists with documented signature; ImageUrlPort interface includes it; unit spec covers the SDK call shape.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Application service + DTO + controller endpoint for POST /photo-upload-url</name>
  <files>apps/api/src/contexts/catalog/application/get-photo-upload-url.service.ts, apps/api/src/contexts/catalog/application/dto.ts, apps/api/src/contexts/catalog/interfaces/http/internal-catalog.controller.ts, apps/api/src/contexts/catalog/catalog.module.ts</files>
  <behavior>
    - `POST /internal/v1/catalog/photo-upload-url` with `{ contentType, sizeBytes }` returns `{ uploadUrl, s3Key }` on 200
    - Server-side allowlist: contentType ∈ {image/jpeg, image/png, image/webp}; sizeBytes ≤ 5_242_880 (5 MiB) — rejected with 400 validation.failed otherwise
    - Generated s3Key is server-chosen: `tenant/{tenantId}/menu-items/{randomUuid}` — operator cannot influence (Tampering mitigation)
    - TTL on presigned URL is 300 seconds (5 minutes) — constant in service file
    - Service calls `requireTenantContext()` first; `tenantId` flows into the s3Key prefix
    - Endpoint guarded by `InternalTokenGuard` (inherited from class-level decorator)
  </behavior>
  <read_first>
    - apps/api/src/contexts/catalog/application/upsert-item.service.ts (analog for tenant-context + IMAGE_URL_PORT injection)
    - apps/api/src/contexts/catalog/application/dto.ts (extend with PhotoUploadUrlInputSchema + PhotoUploadUrlResponseSchema — Zod + createZodDto wrappers)
    - apps/api/src/contexts/catalog/interfaces/http/internal-catalog.controller.ts (add endpoint near other write endpoints; preserve Pattern S3 wrap)
    - apps/api/src/contexts/catalog/catalog.module.ts (register service)
    - .planning/phases/04b-catalog-admin-ui/04B-RESEARCH.md §Pattern 4 (3-step flow) + §Security Domain V12
    - .planning/phases/04b-catalog-admin-ui/04B-UI-SPEC.md §Photo Upload Spec (CAT-03)
  </read_first>
  <action>
    Add Zod schemas to `dto.ts`:
    - `PhotoUploadUrlInputSchema = z.object({ contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']), sizeBytes: z.number().int().positive().max(5_242_880) })` + `PhotoUploadUrlInputDto = createZodDto(...)`
    - `PhotoUploadUrlResponseSchema = z.object({ uploadUrl: z.string().url(), s3Key: z.string().min(1).max(1024) })` + `PhotoUploadUrlResponseDto = createZodDto(...)`
    Create `apps/api/src/contexts/catalog/application/get-photo-upload-url.service.ts`:
    - `@Injectable()` class `GetPhotoUploadUrlService`
    - Inject `IMAGE_URL_PORT` symbol token
    - Constant `private static readonly TTL_SECONDS = 300;`
    - `async execute(input: { contentType, sizeBytes }): Promise<{ uploadUrl, s3Key }>`:
      1. `const ctx = requireTenantContext();`
      2. Generate `const s3Key = `tenant/${ctx.tenantId}/menu-items/${randomUUID()}`;` — server-chosen so operator cannot overwrite arbitrary keys
      3. `const uploadUrl = await this.images.presignPut(s3Key, input.contentType, input.sizeBytes, GetPhotoUploadUrlService.TTL_SECONDS);`
      4. Return `{ uploadUrl, s3Key }`
    Add endpoint to `internal-catalog.controller.ts`: `@Post('photo-upload-url')` + `@HttpCode(HttpStatus.OK)` + `@ApiBody({ type: PhotoUploadUrlInputDto })` + `@ApiOkResponse({ type: PhotoUploadUrlResponseDto })` + `@ApiUnauthorizedResponse({ type: ProblemDetailsDto })`. Body validated via `@Body(new RestoZodValidationPipe(PhotoUploadUrlInputDto))`. Wrap in `wrap(() => this.getPhotoUploadUrl.execute(input));`. Inject `GetPhotoUploadUrlService` in constructor.
    Register service in `catalog.module.ts` providers array.
    Run `pnpm openapi:check` to regenerate artifacts.
    Tests: add `apps/api/test/e2e/catalog-photo-upload.e2e.spec.ts` asserting: (a) valid request returns 200 with uploadUrl + s3Key, (b) s3Key starts with `tenant/${tenantId}/menu-items/`, (c) contentType `application/pdf` returns 400, (d) sizeBytes 6_000_000 returns 400, (e) missing INTERNAL_API_TOKEN returns 401, (f) cross-tenant test: token from tenant A cannot generate keys prefixed with tenant B's id.
  </action>
  <verify>
    <automated>pnpm --filter @resto/api exec vitest run test/e2e/catalog-photo-upload.e2e.spec.ts --no-coverage && pnpm openapi:check</automated>
  </verify>
  <done>
    Endpoint reachable; allowlist enforced; s3Key tenant-scoped; e2e spec passes; OpenAPI artifacts regenerated.
  </done>
</task>

<task type="auto">
  <name>Task 3: MinIO dev bucket CORS for PUT from admin origin</name>
  <files>infra/docker/minio-init.sh</files>
  <read_first>
    - infra/docker/minio-init.sh (existing MinIO init — extend with CORS policy block)
    - infra/docker/docker-compose.dev.yml (verify MinIO container name and admin origin envs)
    - .planning/phases/04b-catalog-admin-ui/04B-RESEARCH.md §Pitfall 2 (CORS + Content-Type binding)
    - apps/admin/lib/env.ts (ADMIN_WEB_URL env var name)
  </read_first>
  <action>
    Extend `infra/docker/minio-init.sh` to add a CORS policy on the menu-photos bucket allowing `PUT` and `GET` from the admin dev origin. Use the `mc` (MinIO Client) CLI inside the init container: `mc anonymous set-json /tmp/cors.json minio/{bucket-name}` (or the equivalent `mc admin policy` mechanism the script already uses). The CORS JSON must include: `AllowedMethods: ['PUT', 'GET']`, `AllowedOrigins: ['http://localhost:3000', 'http://localhost:3100']` (admin dev origins per docker-compose env), `AllowedHeaders: ['Content-Type', 'Content-Length', 'x-amz-*']`, `ExposeHeaders: ['ETag']`, `MaxAgeSeconds: 3600`. If the existing init script uses a different mechanism (anonymous-policy, env vars), match that mechanism rather than introducing a new one.
    Verify dev stack still boots: `pnpm dev:up && pnpm dev:down` (or skip stop if already running). Look at MinIO console logs to ensure no CORS-init error.
  </action>
  <verify>
    <automated>grep -E "PUT|AllowedMethods" infra/docker/minio-init.sh</automated>
  </verify>
  <done>
    MinIO init script configures PUT CORS for admin origin; dev stack boots cleanly.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 4: Manual MinIO upload smoke probe (round-trip from admin dev origin)</name>
  <what-built>Task 1-3 added presignPut, the controller endpoint, and MinIO dev CORS. RESEARCH.md Pitfall #2 calls this out as a "verification step in plan" because presigned PUT URL signature can silently fail (SigV4 binds Content-Type into the signature; CORS misconfiguration yields 403; both produce confusing browser errors).</what-built>
  <how-to-verify>
    1. Ensure dev stack is up: `pnpm dev:up`
    2. Run the api locally: `pnpm --filter @resto/api dev`
    3. Get an internal token from env or `.env.local` (whatever the dev convention is; `INTERNAL_API_TOKEN` is the env var name)
    4. Curl the new endpoint:
       `curl -X POST http://localhost:3001/internal/v1/catalog/photo-upload-url -H "x-internal-token: $INTERNAL_API_TOKEN" -H "content-type: application/json" -d '{"contentType":"image/jpeg","sizeBytes":12345}' -H "x-tenant-id: <a real tenant id from your dev seed>"`
       Expected: 200 with `{ uploadUrl, s3Key }`.
    5. From a separate browser tab open to http://localhost:3000 (admin dev origin), in DevTools console execute:
       `await fetch('<uploadUrl from step 4>', { method: 'PUT', body: new Blob(['test'], { type: 'image/jpeg' }), headers: { 'content-type': 'image/jpeg' } })` and assert the response status is 200 (MinIO returns 200 on success).
    6. Verify the object exists by browsing MinIO console (http://localhost:9001) → menu-photos bucket → confirm the s3Key from step 4 is present.
    If any step fails: CORS is misconfigured OR Content-Type mismatch between presignPut signing and browser PUT. Re-check Task 3 CORS or Task 1 Content-Type passthrough.
  </how-to-verify>
  <resume-signal>Type "approved" after browser-side PUT returns 200 and object is visible in MinIO. If 403/CORS, describe the failure mode.</resume-signal>
  <files>(no source files — human verification only)</files>
  <action>Pause execution and present the verification steps below to the user. Wait for explicit approval before proceeding to the next task.</action>
  <verify><human-check>User confirms the verification steps listed below</human-check></verify>
  <done>User has typed approval (or has rejected with reason) per resume-signal</done>
</task>

<task type="auto">
  <name>Task 5: Terraform stub for production bucket CORS</name>
  <files>infra/terraform/buckets-cors.tf</files>
  <read_first>
    - infra/terraform/ (whatever exists — list directory, find existing bucket resources)
    - apps/CLAUDE.md (production env hygiene — no NEXT_PUBLIC_* fallbacks)
    - .planning/phases/04b-catalog-admin-ui/04b-CONTEXT.md §D-4b-07 (Terraform stub for prod requirement)
  </read_first>
  <action>
    Create `infra/terraform/buckets-cors.tf` as a stub Terraform file (the repo's Terraform tree is currently a stub per CLAUDE.md Platform Requirements). The file should:
    - Define `resource "aws_s3_bucket_cors_configuration" "menu_photos"` with `cors_rule` block containing `allowed_methods = ["PUT", "GET"]`, `allowed_origins = [var.admin_web_url]`, `allowed_headers = ["Content-Type", "Content-Length", "x-amz-*"]`, `expose_headers = ["ETag"]`, `max_age_seconds = 3600`
    - Declare `variable "admin_web_url"` with `description = "Admin app origin URL — must match ADMIN_WEB_URL env on the api"` and `type = string`
    - Add a comment block at the top: `# Phase 4b D-4b-07: production bucket CORS for admin direct-PUT photo upload (CAT-03). Apply via `terraform apply` after Phase 4b ships. See infra/docker/minio-init.sh for dev parity.`
    Do NOT run `terraform apply` — the user must apply this manually when the production bucket is provisioned. Mark the user_setup frontmatter field so execute-plan surfaces this to the operator.
  </action>
  <verify>
    <automated>test -f infra/terraform/buckets-cors.tf && grep -q "allowed_methods" infra/terraform/buckets-cors.tf && grep -q "PUT" infra/terraform/buckets-cors.tf</automated>
  </verify>
  <done>
    Terraform stub file exists with allowed_methods including PUT; documents the manual apply step.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Browser → S3 (direct PUT) | Operator's browser uploads photo bytes directly to S3 using a presigned URL |
| Admin server action → api `/internal/v1/catalog/photo-upload-url` | Server-only fetch carries INTERNAL_API_TOKEN |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-04b-03-01 | Spoofing | SSRF via operator-supplied upload URL | mitigate | presignPut returns server-generated URL; admin never accepts a URL from operator (RESEARCH.md Security Domain) |
| T-04b-03-02 | Tampering | Direct-PUT to wrong bucket / overwrite arbitrary key | mitigate | s3Key is server-generated `tenant/${tenantId}/menu-items/${uuid}`; operator cannot influence (Task 2 service) |
| T-04b-03-03 | DoS | Oversized photo upload | mitigate | presignPut enforces sizeBytes ≤ 5 MiB; AWS SigV4 binds the content-length into the signed URL (Task 1 + 2) |
| T-04b-03-04 | Spoofing | Replay of presigned PUT URL | mitigate | TTL ≤ 5 min (300s); even with replay, key is server-chosen so no collision risk (Task 2) |
| T-04b-03-05 | Tampering | Content-Type mismatch silently succeeding | mitigate | SigV4 binds Content-Type into signature; mismatch returns 403 from S3; allowlist {jpeg, png, webp} enforced at presign time (Task 2 Zod) |
| T-04b-03-06 | Information Disclosure | CORS misconfiguration leaking bucket to attacker origin | mitigate | MinIO + Terraform stub allow PUT/GET only from `ADMIN_WEB_URL`; no `*` wildcard (Tasks 3, 5) |
| T-04b-03-07 | Repudiation | Bucket CORS not applied in production | mitigate | Task 5 Terraform stub + user_setup frontmatter surface the manual apply step to the deployer |
</threat_model>

<verification>
- presignPut returns non-empty URL for valid input
- POST /photo-upload-url returns 400 for disallowed contentType and oversized sizeBytes
- s3Key is tenant-scoped (regex match)
- MinIO dev stack accepts browser PUT from admin origin (Task 4 manual probe)
- Terraform stub references PUT method + variable for admin origin
- OpenAPI artifacts regenerated; drift gate green
</verification>

<success_criteria>
1. ImageUrlPort interface extended with presignPut
2. S3 adapter implements presignPut; unit spec passes
3. POST /photo-upload-url endpoint live with allowlist + size cap
4. s3Key is server-generated tenant-scoped
5. MinIO dev CORS allows PUT from admin origin (manual probe passes)
6. Terraform stub exists for prod bucket CORS apply
7. OpenAPI artifacts updated; drift gate green
</success_criteria>

<output>
Create `.planning/phases/04b-catalog-admin-ui/04b-03-SUMMARY.md` when done.
</output>
