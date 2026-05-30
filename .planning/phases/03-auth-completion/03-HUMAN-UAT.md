---
status: partial
phase: 03-auth-completion
source: ['03-VERIFICATION.md']
started: '2026-05-30T18:08:00Z'
updated: '2026-05-30T18:08:00Z'
---

## Current Test

[awaiting human testing]

## Tests

### 1. WR-03: Role-changed audit row semantics

expected: |
After a role change via `auth.api.updateMemberRole`, the audit row contains:
`targetType='user'`, `targetId=<userId of the member whose role changed>`,
`actorSubject=<userId of the initiator>` (or the member's userId as fallback
with a WARN log). Semantically: "whose role changed" = target;
"who changed it" = actor.
result: [pending]

### 2. E2E suite: AUTH-10 DLQ poison-message (`nats-dlq-poison.e2e.spec.ts`)

expected: |
4 assertions: (1) `max_deliver=5` caps redelivery,
(2) poison bytes land on `dlq.<subject>`,
(3) `identity.email_dispatch_failed.v1` envelope appears on outbox,
(4) no further deliveries after DLQ routing.
result: [pending]

### 3. E2E suite: AUTH-02/03 invitation flow (`identity-invitation.e2e.spec.ts`)

expected: |
Owner sends invitation → email via `CapturedEmailAdapter`; admin sending
role=owner returns 403; accept-invitation 5-branch state machine works.
result: [pending]

### 4. E2E suite: AUTH-04/05/06 password reset + email verification

expected: |
Forgot-password → email via adapter; reset-password with single-use token;
`REQUIRE_EMAIL_VERIFICATION=true` blocks sensitive endpoints.
result: [pending]

### 5. E2E suite: AUTH-07 2FA TOTP (`identity-two-factor.e2e.spec.ts`)

expected: |
Enable → 10 recovery codes shown once; verify with correct TOTP code →
`twoFactorEnabled=true`; Pitfall 7: without verify, `twoFactorEnabled`
stays false.
result: [pending]

### 6. E2E suite: D-06 signup enumeration parity (`signup-enumeration.e2e.spec.ts`)

expected: |
POST `/v1/signup` with an existing email returns an identical 201 +
body `{ status: 'pending_verification' }`; timing parity ≤60ms.
result: [pending]

### 7. E2E suite: AUTH-09 role-change audit (`identity-role-changed.e2e.spec.ts`)

expected: |
`updateMemberRole` → `afterUpdateMemberRole` hook → `identity.role_changed.v1`
on outbox → `audit_log` row materialized.
result: [pending]

### 8. E2E suite: D-21 GDPR retention (`gdpr-retention.e2e.spec.ts`)

expected: |
Cron deletes invitation rows >30 days with `expired/revoked/accepted` status;
pending rows preserved. Verification rows >1h are deleted.
result: [pending]

### 9. E2E suite: D-20 per-tenant signin rate-limit (`per-tenant-signin-rate-limit.e2e.spec.ts`)

expected: |
`RATE_LIMIT_AUTH_SIGNIN_PER_TENANT_PER_MIN+1` requests/min → 429;
timing parity — 429 does not reveal per-tenant bucket presence.
result: [pending]

## Summary

total: 9
passed: 0
issues: 0
pending: 9
skipped: 0
blocked: 0

## Gaps
