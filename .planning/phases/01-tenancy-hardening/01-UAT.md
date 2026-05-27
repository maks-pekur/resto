---
status: complete
phase: 01-tenancy-hardening
source:
  - 01-01-SUMMARY.md
  - 01-02-SUMMARY.md
  - 01-03-SUMMARY.md
  - 01-04-SUMMARY.md
  - 01-05-SUMMARY.md
  - 01-06-SUMMARY.md
started: '2026-05-27T00:00:00Z'
updated: '2026-05-27T00:05:00Z'
verification_mode: accept-all (batch)
verification_basis: |
  Phase 01 outcomes are predominantly invariant-enforcement and backend infrastructure with no UI surface.
  Each test below is covered by an automated e2e or integration spec that PASSES on main:
    - background-jobs.e2e.spec.ts 4/4 PASS (covers tests 4, 5)
    - tenancy-suspend.e2e.spec.ts 6/6 PASS (covers tests 2, 3, 4)
    - identity-audit.e2e.spec.ts 4/4 PASS (covers test 6)
    - cross-tenant-{als-leak,nats-mix,isolation}.e2e.spec.ts (covers internal isolation)
    - raw-tx-rls-fence + concurrent-write-race integration specs (covers TEN-08 fixture matrix)
    - preflight-ba-creds + preflight-without-tenant-allowlist + preflight-inbox-processed-deletable
      integration specs PASS (covers test 5)
    - no-restricted-syntax fixture suite in packages/config-eslint PASSES (covers test 7)
  User explicitly accepted via "accept all" after being informed of the option. This UAT serves as
  formal closure of Phase 01 rather than independent manual verification.
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test

expected: Kill server + clear state + boot from scratch — all 6 preflight checks log PASS, API binds to port, basic query returns 200, no boot errors.
result: pass
note: Accepted via batch ("accept all"). Boot preflight chain validated by integration specs in packages/db (3 of the 6 assertions have dedicated specs); ENV validation is covered by env.schema.ts Zod schema; bootstrap success is exercised every time any apps/api e2e spec spins up the Nest app.

### 2. Operator suspends a tenant — public menu blocked

expected: POST /internal/v1/tenants/:id/suspend returns 200 + status=suspended; subsequent GET /v1/menu returns 403 with code "tenancy.tenant_suspended".
result: pass
note: Accepted via batch. Covered by tenancy-suspend.e2e.spec.ts cases "POST /suspend transitions tenant to suspended", "GET /v1/menu returns 403 when tenant is suspended", "body.code is tenancy.tenant_suspended" — all PASS on main.

### 3. Operator resumes a tenant — public menu accessible again

expected: POST /internal/v1/tenants/:id/resume returns 200 + status=active; subsequent GET /v1/menu returns 200.
result: pass
note: Accepted via batch. Covered by tenancy-suspend.e2e.spec.ts cases "POST /resume transitions tenant back to active", "GET /v1/menu returns 200 after resume" — both PASS.

### 4. Audit trail for suspend/resume operations

expected: After suspend + resume, audit_log has rows for tenancy.tenant_suspended.v1 and tenancy.tenant_resumed.v1 with correct tenant_id, actor_subject, target_type='tenant'.
result: pass
note: Accepted via batch. Covered by tenancy-suspend.e2e.spec.ts "audit roundtrip" assertions on both suspend and resume actions — PASS. ACTION_TARGET_KIND for tenant offboarding/erasure events extended in plan 01-05 (commit fc24c7e on main).

### 5. Boot preflight chain ordering

expected: 6 preflight PASS lines logged in order (rls-bypass < tenant-lock < set-config-revoked < ba-creds < inbox-processed-deletable < without-tenant-allowlist), then "Resto api listening" appears AFTER.
result: pass
note: Accepted via batch. Order is structurally enforced by sequential `await` statements in apps/api/src/main.ts (verified by reading file, line offsets 54 < 60 < 66 < new 70 < 76 per 01-04-SUMMARY.md). Each individual preflight has its own integration spec; the combined ordering is a property of the source file and cannot drift unless main.ts is edited.

### 6. Sign-out emits identity.signed_out audit row

expected: POST /api/auth/sign-out returns 200; within ~20s audit_log has identity.signed_out.v1 row with correct actor_subject.
result: pass
note: Accepted via batch. Covered by identity-audit.e2e.spec.ts case "records identity.signed_out.v1 in audit_log with actor and ip metadata" — PASS after RC-3 fix (PR #193 added the x-tenant-id header to sanity probes).

### 7. TEN-15 ESLint rule blocks correlationId literals

expected: Adding `correlationId: randomUUID()` to a file under apps/api / packages/db / packages/events causes eslint to error with no-restricted-syntax message; remove disable-comment patterns from the existing 8 migrated sites and the rule should fire.
result: pass
note: Accepted via batch. Covered by packages/config-eslint/test/no-restricted-syntax.spec.ts (4/4 PASS — 2 forbidden fixtures fire, 2 legal fixtures don't). Live-lint was also performed during plan 01-04 deviation discovery (3 errors before disable markers, 0 after) — flat-config rule-merging fix verified at that time.

## Summary

total: 7
passed: 7
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none — all tests passed]
