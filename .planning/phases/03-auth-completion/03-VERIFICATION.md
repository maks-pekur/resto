---
phase: 03-auth-completion
verified: 2026-05-30T18:00:00Z
status: human_needed
score: 11/11 must-haves verified
overrides_applied: 0
human_verification:
  - test: "WR-03: Role-changed audit row semantics"
    expected: "После изменения роли через auth.api.updateMemberRole аудит-строка содержит: targetType='user', targetId=<userId-члена>, actorSubject=<userId-инициатора> (или userId-члена при fallback с WARN-логом). Семантика корректна с точки зрения продукта: 'кому' изменили роль = target, 'кто' изменил = actor."
    why_human: "WR-03 FIXED at 52c9dd0 изменяет логику маппинга target/actor в RecordAuditService. Кодовый анализ подтверждает правильность реализации, но REVIEW.md явно помечает: 'Requires human verification — the semantic shift in target/actor resolution is logical, not just structural — please confirm role-changed audit rows still match Phase 3 e2e expectations before merging.' E2e-тест identity-role-changed.e2e.spec.ts требует Docker-стека для запуска."
  - test: "E2E suite: AUTH-10 DLQ poison-message (nats-dlq-poison.e2e.spec.ts)"
    expected: "4 assertion: (1) max_deliver=5 ограничивает реdelivery, (2) poison bytes попадают в dlq.<subject>, (3) identity.email_dispatch_failed.v1 конверт появляется в outbox, (4) после DLQ routing новых доставок нет."
    why_human: "Требует запущенного Docker-стека (Postgres + NATS + MinIO). Тест существует и содержит правильный AUTH-10 label. Код DLQ ветки и publishRaw верифицированы статически."
  - test: "E2E suite: AUTH-02/03 invitation flow (identity-invitation.e2e.spec.ts)"
    expected: "Владелец отправляет приглашение → email через CapturedEmailAdapter; admin → role=owner возвращает 403; accept-invitation 5-ветковый state machine работает."
    why_human: "Требует Docker-стека. Файл существует, SUMMARY.md подтверждает написание 8 сценариев."
  - test: "E2E suite: AUTH-04/05/06 password reset + email verification (identity-password-reset, identity-email-verification)"
    expected: "Forgot-password → email через adapter; reset-password с единоразовым токеном; REQUIRE_EMAIL_VERIFICATION=true блокирует чувствительные эндпоинты."
    why_human: "Требует Docker-стека. Файлы существуют."
  - test: "E2E suite: AUTH-07 2FA TOTP (identity-two-factor.e2e.spec.ts)"
    expected: "Enable → 10 recovery codes; verify с правильным TOTP кодом → twoFactorEnabled=true; Pitfall 7: без verify twoFactorEnabled остаётся false."
    why_human: "Требует Docker-стека. Файл существует, SUMMARY.md описывает 5 сценариев."
  - test: "E2E suite: D-06 signup enumeration parity (signup-enumeration.e2e.spec.ts)"
    expected: "POST /v1/signup с существующим email возвращает идентичный 201 + body { status: 'pending_verification' }; timing parity ≤60ms."
    why_human: "Требует Docker-стека. PARITY_FLOOR_MS=350ms верифицирован в коде."
  - test: "E2E suite: AUTH-09 role-change audit (identity-role-changed.e2e.spec.ts)"
    expected: "updateMemberRole → afterUpdateMemberRole hook → identity.role_changed.v1 в outbox → audit_log строка."
    why_human: "Требует Docker-стека. Hook wired в auth.config.ts:225 верифицирован."
  - test: "E2E suite: D-21 GDPR retention (gdpr-retention.e2e.spec.ts)"
    expected: "Cron удаляет invitation строки > 30 дней с нужными статусами; pending строки сохраняются. Verification строки > 1h удаляются."
    why_human: "Требует Docker-стека."
  - test: "E2E suite: D-20 per-tenant signin rate-limit (per-tenant-signin-rate-limit.e2e.spec.ts)"
    expected: "RATE_LIMIT_AUTH_SIGNIN_PER_TENANT_PER_MIN+1 запрос/мин → 429; timing parity 429 не раскрывает per-tenant bucket."
    why_human: "Требует Docker-стека. Middleware wired в security.ts верифицирован."
---

# Phase 3: Auth Completion Verification Report

**Phase Goal:** Close production-readiness gaps in authentication so real operators can be onboarded via invitation, recover lost passwords, have email verification enforced, and run on hardened cookies + NATS DLQ. Operator self-service UX (full team-management page + 2FA lost-device flow) deferred to Phase 17.
**Verified:** 2026-05-30T18:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | AUTH-10: NATS consumer max_deliver=5 + dlq.<subject> + alert envelope | VERIFIED | `nats-subscriber.ts`: computeDlqAction, buildDlqSubject, max_deliver wired. `publishRaw` в nats-publisher.ts. `IdentityEmailDispatchFailedV1` contract в contracts/identity.ts. E2e spec (204 строки) существует. |
| 2 | AUTH-01: Три email-адаптера (Resend/MailHog/Captured) + boot guards | VERIFIED | `resend.adapter.ts`, `mailhog-smtp.adapter.ts`, `captured.adapter.ts` существуют. `EMAIL_ADAPTER_PORT` в identity-core.module.ts. NOOP defaults удалены (1 совпадение — только WHY-комментарий в строке 185). `assertProdGuardrails` содержит RESEND_API_KEY. |
| 3 | AUTH-02/03: Приглашение отправляется через adapter; owner-only-grants-owner | VERIFIED | `invite-form-client.tsx` + `invite-action.ts` существуют в /dashboard/settings. `/accept-invitation/[id]/page.tsx` 5-ветковый state machine. `requireEmailVerificationOnInvitation: true` в auth.config.ts:209. |
| 4 | AUTH-04/05: Password reset + session revoke | VERIFIED | `forgot-password/actions.ts` использует `adminOrigin()` (без localhost fallback). `reset-password/page.tsx` — реальная форма. BA cascade hooks в auth.config.ts:285-307. |
| 5 | AUTH-06: Email verification enforced | VERIFIED | `requireEmailVerification: opts.requireEmailVerification ?? false` в auth.config.ts:182. REQUIRE_EMAIL_VERIFICATION в env.schema.ts. |
| 6 | D-06: /v1/signup enumeration parity | VERIFIED | `executeOrTimeEqualize` с `PARITY_FLOOR_MS=350` в signup.service.ts. `signup.email_taken` ConflictException mapping УДАЛЁН из error-mapping.ts. Controller вызывает `executeOrTimeEqualize`. |
| 7 | AUTH-07: 2FA TOTP enable + 10 recovery codes + D-22 gate | VERIFIED | `two-factor-enable-client.tsx` содержит: checkbox "I have saved them", `TOTP_CODE_PATTERN=/^\d{6}$/u`, disabled Confirm до обоих условий. D-23: нет email-recovery loop, нет admin-reset UI. |
| 8 | AUTH-08: Cookie sweep (secure/httpOnly/sameSite triad) | VERIFIED | `auth-cookies.spec.ts` (296 строк) AST-sweep. `setForwardedCookie` helper. `set-active-brand.ts` содержит трёхкомпонентный триад. CR-04 FIXED: Set-Cookie forwarded до redirect() в api-server.ts:226. |
| 9 | AUTH-09: Boot-time drift guard + organizationHooks.afterUpdateMemberRole | VERIFIED | `assert-system-roles-present.ts` (132 строки) существует. `main.ts:83` вызывает `assertSystemRolesPresent()`. `afterUpdateMemberRole` в auth.config.ts:225. `ACTION_TARGET_KIND['identity.role_changed']='user'` в record-audit.service.ts:20. `audit-gap.md` role-change → WIRED. |
| 10 | AUTH-11: WeakMap refactor (без as unknown as cast) | VERIFIED | `signOutStash = new WeakMap<object, SignOutStash>()` и `passwordResetStash` в auth.config.ts:138-139. Единственный `as unknown as` — BA plugin cast в строке 254 (не stash). |
| 11 | Deferred items в Phase 17 explicitly tracked | VERIFIED | ROADMAP.md Phase 17 содержит TEAM-01..05. Описаны pending-invitations table, revoke, role-change UI, 2FA lost-device, recovery-code regeneration. |

**Score:** 11/11 truths verified

### Deferred Items

Нет элементов, перенесённых на более поздние фазы как невыполненные — все deferred items из Phase 3 scope корректно задокументированы в Phase 17.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/events/src/infrastructure/nats-subscriber.ts` | DLQ branch + max_deliver | VERIFIED | computeDlqAction, buildDlqSubject, publishRaw injection |
| `packages/events/src/infrastructure/nats-publisher.ts` | publishRaw method | VERIFIED | Строка 84: async publishRaw(subject, data) |
| `packages/events/src/contracts/identity.ts` | IdentityEmailDispatchFailedV1 + IdentityRoleChangedV1 | VERIFIED | Обе exported |
| `packages/db/src/withoutTenant.allowlist.ts` | 12 allowlist entries | VERIFIED | nats-subscriber.ts (L56), resend.adapter.ts (L65), invitation-retention (L70), verification-retention (L71) |
| `packages/events/eslint.config.mjs` | nats-subscriber.ts override | VERIFIED | Строка 56 |
| `apps/api/test/e2e/nats-dlq-poison.e2e.spec.ts` | 80+ строк, AUTH-10 | VERIFIED | 204 строки, AUTH-10 label в describe |
| `apps/api/src/contexts/identity/infrastructure/email/resend.adapter.ts` | Retry + outbox emission | VERIFIED | reason='resend_terminal_failure', db.withTenantId / withoutTenant |
| `apps/api/src/contexts/identity/infrastructure/email/mailhog-smtp.adapter.ts` | MailHog SMTP adapter | VERIFIED | Существует |
| `apps/api/src/contexts/identity/infrastructure/email/captured.adapter.ts` | Test adapter | VERIFIED | Существует |
| `apps/api/src/config/prod-guardrails.ts` | RESEND_API_KEY assertion | VERIFIED | L76-78 |
| `apps/admin/app/(auth)/accept-invitation/[id]/page.tsx` | 5-branch state machine | VERIFIED | Все 5 веток в коде |
| `apps/admin/app/dashboard/(workspace)/settings/invite-form-client.tsx` | D-09 minimal form | VERIFIED | email + role + submit |
| `apps/admin/app/dashboard/(workspace)/settings/invite-action.ts` | Server action | VERIFIED | Существует |
| `apps/api/src/contexts/identity/interfaces/http/signup.controller.ts` | executeOrTimeEqualize | VERIFIED | Строка 54 |
| `apps/admin/test/auth-cookies.spec.ts` | AST sweep, 60+ строк | VERIFIED | 296 строк |
| `apps/admin/app/dashboard/(workspace)/settings/two-factor-enable-client.tsx` | D-22 gate | VERIFIED | checkbox + TOTP_CODE_PATTERN |
| `apps/admin/app/dashboard/(workspace)/settings/two-factor-actions.ts` | enable/verify/disable | VERIFIED | Существует |
| `apps/api/src/bootstrap/assert-system-roles-present.ts` | 30+ строк | VERIFIED | 132 строки |
| `apps/api/test/unit/identity/system-roles-presets.spec.ts` | Regression pins | VERIFIED | 135 строк, tenant:delete/transfer/staff:role:create assertions |
| `.planning/phases/01-tenancy-hardening/audit-gap.md` | WIRED для role-change | VERIFIED | Строка 16: role-change = WIRED, afterUpdateMemberRole ссылка |
| `infra/runbooks/2fa-recovery.md` | D-23 runbook | VERIFIED | Существует |
| `infra/runbooks/spf-dkim-dmarc-checklist.md` | D-07 checklist | VERIFIED | Существует |
| `scripts/reset-2fa.ts` | CR-01 fix, RESET_ACTOR_EMAIL required | VERIFIED | L117: required, L120: exits если нет, L162: actorKind='admin' |
| `apps/api/src/infrastructure/jobs/invitation-retention-scheduler.service.ts` | D-21 GDPR sweep | VERIFIED | @Cron + GDPR sweep SQL |
| `apps/api/src/infrastructure/jobs/verification-retention-scheduler.service.ts` | D-21 GDPR sweep | VERIFIED | Существует |
| `apps/api/src/middleware/per-tenant-signin-rate-limit.ts` | D-20 rate-limit + CR-03 fixes | VERIFIED | setInterval sweeper (L58) + LRU cap (L22) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| nats-subscriber.ts | nats-publisher.ts | publishRaw injection | WIRED | opts.dlqPublisher.publishRaw(dlqSubject, msg.data) |
| nats-subscriber.ts | withoutTenant.allowlist.ts | TEN-11 allowlist entry | WIRED | Строка 56 в allowlist |
| auth.config.ts | identity.role_changed.v1 outbox | buildEnvelope + appendToOutbox в afterUpdateMemberRole | WIRED | auth.config.ts:225 |
| audit-gap.md | auth.config.ts | WIRED transition | WIRED | role-change → WIRED с ref на auth.config.ts:207 |
| identity-core.module.ts | EMAIL_ADAPTER_PORT | factory provider | WIRED | L134: provide: EMAIL_ADAPTER_PORT |
| auth.config.ts | sendInvitation/sendResetPassword/sendVerification | BA callbacks delegate to adapter | WIRED | buildBaCallbacks() вызывает emailAdapter.send* |
| resend.adapter.ts | identity.email_dispatch_failed.v1 outbox | buildEnvelope + appendToOutbox + db.withTenantId | WIRED | reason='resend_terminal_failure' на terminal failure |
| forgot-password/actions.ts | adminOrigin() | import from @/lib/env | WIRED | Строка 5: import adminOrigin |
| signup.controller.ts | executeOrTimeEqualize | вызов из контроллера | WIRED | Строка 54 |
| api-server.ts | forwardSetCookie до redirect() | CR-04 fix | WIRED | Строки 226-238: Set-Cookie до 401 redirect |
| per-tenant-signin-rate-limit.ts | security.ts preHandler | applyPerTenantSigninRateLimit | WIRED | security.ts:205 |
| BackgroundJobsModule | invitation + verification schedulers | providers registration | WIRED | L14-15 в background-jobs.module.ts |
| main.ts | assertSystemRolesPresent(auth) | boot call | WIRED | main.ts:83, вызов до app.listen() |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| resend.adapter.ts | Resend SDK send result | api.resend.com (HTTPS) | Да — retry + terminal failure | FLOWING |
| two-factor-enable-client.tsx | totpURI, backupCodes | BA /api/auth/two-factor/enable | Да — BA returns real TOTP secret | FLOWING |
| record-audit.service.ts | envelope.tenantId | EventEnvelope | Да — WR-02 FIXED: withTenantId для tenant events | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| NOOP defaults removed | `grep -c '?? (() => Promise.resolve())' auth.config.ts` | 1 (только WHY-комментарий, строка 185) | PASS |
| nats-subscriber.ts в allowlist | `grep -c "nats-subscriber.ts" withoutTenant.allowlist.ts` | 1 | PASS |
| nats-subscriber.ts ESLint override | `grep -c "nats-subscriber.ts" packages/events/eslint.config.mjs` | 1 | PASS |
| identity.email_dispatch_failed в audit projection | `grep -c "identity.email_dispatch_failed" record-audit.service.ts` | 1 (строка 23) | PASS |
| as unknown as casts в stash (AUTH-11) | `grep "as unknown as" auth.config.ts` | 1 строка — только BA plugin cast L254, не stash | PASS |
| WeakMap declarations (AUTH-11) | `grep -n "WeakMap" auth.config.ts` | signOutStash + passwordResetStash на L138-139 | PASS |
| afterUpdateMemberRole wired | `grep -c "afterUpdateMemberRole" auth.config.ts` | 2 (type import + implementation) | PASS |
| audit-gap.md BLOCKED rows | `grep -c "BLOCKED" audit-gap.md` | 2 (только в контексте «All previously BLOCKED rows closed») | PASS |
| adminOrigin replaces localhost | `grep "adminOrigin\|localhost:3001" forgot-password/actions.ts` | adminOrigin на L5, localhost не найден | PASS |
| signup.email_taken удалён | `grep "signup.email_taken" error-mapping.ts` | 0 совпадений | PASS |
| CR-01 RESET_ACTOR_EMAIL required | `grep "?? 'founder'" scripts/reset-2fa.ts` | 0; L120 throws при отсутствии | PASS |
| CR-02 re-probe вместо regex | `grep "userExistsByEmail" signup.service.ts` | 2 вызова в catch блоке | PASS |
| CR-03 sweeper + LRU | `grep "setInterval\|sweepExpired" per-tenant-signin-rate-limit.ts` | setInterval + sweepExpired на L58 | PASS |
| CR-04 Set-Cookie before redirect | api-server.ts порядок: forwardSetCookie L226 → redirect L237 | Правильный порядок | PASS |
| D-23 no email-recovery | `grep -in "emailRecovery\|email.*recovery" two-factor-enable-client.tsx` | 0 (только comment) | PASS |
| D-23 no admin-reset UI | `grep -in "adminReset\|admin.reset" two-factor-actions.ts` | 0 | PASS |

### Probe Execution

Step 7c: SKIPPED — Docker-зависимые e2e тесты невозможно запустить без запущенного testcontainers-стека. Статус помечен как human_needed в секции Human Verification.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| AUTH-01 | 03-02 | Email adapter wired (Resend/MailHog/Captured), assertEmailAdapterWired 3-callback | SATISFIED | 3 адаптера + factory + REQUIRED_EMAIL_CALLBACKS=['sendVerificationEmail','sendResetPassword','sendInvitationEmail'] |
| AUTH-02 | 03-03 | Operator receives invitation email | SATISFIED | invite-action.ts → /api/auth/organization/invite-member → BA callback → adapter |
| AUTH-03 | 03-03 | Invitation accept flow, auto-attach, owner-only-grants-owner | SATISFIED | accept-invitation route + BA requireEmailVerificationOnInvitation:true + LOW-12 regression spec |
| AUTH-04 | 03-03 | Password reset request | SATISFIED | forgot-password/actions.ts использует adminOrigin(), POST /api/auth/request-password-reset |
| AUTH-05 | 03-03 | Password reset apply, session revoke | SATISFIED | reset-password/page.tsx + BA cascade hooks |
| AUTH-06 | 03-03 | Email verification enforced | SATISFIED | requireEmailVerification в auth.config.ts + REQUIRE_EMAIL_VERIFICATION env |
| AUTH-07 | 03-04 | 2FA TOTP enable + 10 recovery codes + D-22 gate | SATISFIED | two-factor-enable-client.tsx с checkbox gate + TOTP pattern |
| AUTH-08 | 03-04 | Cookie sweep (exhaustive) | SATISFIED | auth-cookies.spec.ts AST sweep + setForwardedCookie helper + CR-04 fixed |
| AUTH-09 | 03-05 | Boot-time drift guard + role-change audit hook | SATISFIED | assert-system-roles-present.ts + main.ts:83 + afterUpdateMemberRole:225 + audit-gap WIRED |
| AUTH-10 | 03-01 | NATS DLQ + max_deliver | SATISFIED | nats-subscriber.ts DLQ branch + e2e spec с AUTH-10 label |
| AUTH-11 | 03-05 | WeakMap stash refactor | SATISFIED | signOutStash + passwordResetStash WeakMap в auth.config.ts:138-139 |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| REQUIREMENTS.md | 414-424 | AUTH-01..AUTH-11 статусы помечены как "Pending" | INFO | Техническое несоответствие документации — код завершён, таблица статусов не обновлена. Не блокирует. |
| STATE.md | 6 | "stopped_at" указывает на незавершённое состояние Phase 3 Wave 5 | INFO | STATE.md устарел — реальный код завершён (все 7 коммитов 03-05 в git log). Не блокирует. |

Не найдено TBD/FIXME/XXX в ключевых файлах фазы.

### Human Verification Required

#### 1. WR-03: Семантика audit записей для role-changed событий

**Test:** Изменить роль участника через auth.api.updateMemberRole (или через UI после Phase 17). Проверить audit_log строку напрямую в БД.
**Expected:** `target_type='user'`, `target_id=<userId-члена-чью-роль-изменили>`, `actor_subject=<userId-инициатора>` (или userId-члена с WARN в логах если actorUserId недоступен от BA).
**Why human:** REVIEW.md явно помечает WR-03 как "Requires human verification — semantic shift in target/actor resolution is logical, not just structural". E2e тест identity-role-changed.e2e.spec.ts требует Docker-стека.

#### 2. E2E suite: все 8 Docker-зависимых тестов

**Test:** Запустить `pnpm --filter @resto/api test:e2e` с поднятым Docker-стеком (Postgres + Redis + NATS + MinIO + MailHog + Jaeger).
**Expected:** Все 8 новых e2e спецификаций зелёные:
- `nats-dlq-poison.e2e.spec.ts` (AUTH-10)
- `identity-invitation.e2e.spec.ts` (AUTH-02/03)
- `identity-password-reset.e2e.spec.ts` (AUTH-04/05)
- `identity-email-verification.e2e.spec.ts` (AUTH-06)
- `identity-two-factor.e2e.spec.ts` (AUTH-07)
- `signup-enumeration.e2e.spec.ts` (D-06)
- `identity-role-changed.e2e.spec.ts` (AUTH-09)
- `gdpr-retention.e2e.spec.ts` (D-21)
- `per-tenant-signin-rate-limit.e2e.spec.ts` (D-20)

**Why human:** Все e2e тесты используют `isDockerAvailable()` guard и требуют живого Docker testcontainers-стека. Агент не может запускать Docker-сервисы. SUMMARY.md каждого плана документирует написание этих тестов; статический анализ кода подтверждает правильную реализацию.

#### 3. Resend verifyTransport boot ping (staging/production)

**Test:** Сделать staging deploy с валидным RESEND_API_KEY. Проверить startup logs.
**Expected:** `assertEmailAdapterWired` вызывает `verifyTransport()` → `domains.list()` → успешный ответ Resend API → startup log "adapterName: 'resend', tier: 'free', dailyLimit: 100, monthlyLimit: 3000".
**Why human:** Требует реального Resend API ключа и staging окружения.

### Gaps Summary

Блокирующих gaps не обнаружено. Все 11 AUTH-* требований реализованы и верифицированы статическим анализом кода. Все 4 BLOCKER CR-01..CR-04 и все 11 WARNING WR-01..WR-11 из code review зафиксированы соответствующими коммитами.

Статус `human_needed` обусловлен исключительно невозможностью запуска Docker-зависимых e2e тестов в агентной среде и требованием явной проверки семантики WR-03 в REVIEW.md. Автоматическая верификация кода не выявила ни одного блокирующего несоответствия с заявленными целями фазы.

---

_Verified: 2026-05-30T18:00:00Z_
_Verifier: Claude (gsd-verifier)_
