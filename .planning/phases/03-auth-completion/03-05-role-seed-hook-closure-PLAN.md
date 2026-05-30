---
phase: 03-auth-completion
plan: 05
type: execute
wave: 5
# depends_on revised per plan-checker W-3 2026-05-30: was ["03-04"] in initial draft.
# No code-level dependency on Plan 04 (cookies + 2FA UI). Code-level dep is on Plan 02
# (Resend adapter + IdentityEmailDispatchFailedV1 contract). Parallelizable with 03-04.
depends_on: ['03-02']
files_modified:
  - apps/api/src/bootstrap/assert-system-roles-present.ts
  - apps/api/src/main.ts
  - apps/api/src/contexts/identity/infrastructure/better-auth/auth.config.ts
  - packages/events/src/contracts/identity.ts
  - apps/api/src/contexts/audit/application/record-audit.service.ts
  - apps/api/src/infrastructure/background-jobs.module.ts
  - apps/api/src/infrastructure/jobs/invitation-retention-scheduler.service.ts
  - apps/api/src/infrastructure/jobs/verification-retention-scheduler.service.ts
  - packages/db/src/withoutTenant.allowlist.ts
  - apps/api/eslint.config.mjs
  - apps/api/src/middleware/per-tenant-signin-rate-limit.ts
  - test/unit/system-roles-presets.spec.ts
  - apps/api/test/e2e/identity-role-changed.e2e.spec.ts
  - apps/api/test/e2e/gdpr-retention.e2e.spec.ts
  - apps/api/test/e2e/per-tenant-signin-rate-limit.e2e.spec.ts
  - .planning/phases/01-tenancy-hardening/audit-gap.md
  - infra/runbooks/2fa-recovery.md
  - infra/runbooks/spf-dkim-dmarc-checklist.md
  - scripts/reset-2fa.ts
autonomous: true
requirements:
  - AUTH-09
  - AUTH-11
goal: |
  Close Phase 3 with the AUTH-09 dual deliverable as REINTERPRETED per
  plan-checker B-4 2026-05-30: (a) boot-time `assertSystemRolesPresent`
  drift guard pinning that BA's in-memory accessControl map matches
  `SYSTEM_ROLES` exactly (NO `organization_role` DB migration — the table
  is BA's DYNAMIC tenant-creatable role storage, static presets live in
  `access-control.ts:6-9` + `auth.config.ts:148-153`); (b) wiring
  organizationHooks.afterUpdateMemberRole to emit identity.role_changed.v1
  through outbox per D-16a. Also ships the AUTH-11 WeakMap refactor of the
  BA context-stash, the GDPR daily sweep extension to invitation +
  verification tables per D-21 (as new sibling scheduler services under
  BackgroundJobsModule per RESEARCH.md Open Question 2 RESOLVED), the
  per-tenant signin rate-limit wiring per D-20, the founder-side 2FA
  recovery runbook per D-23, the SPF/DKIM/DMARC pre-deploy checklist per
  D-07, and the explicit audit-gap.md BLOCKED row → WIRED transition with
  reference to the live hook.
tags:
  - role-seed
  - rbac
  - organization-hooks
  - audit-gap
  - weakmap-refactor
  - gdpr-retention
  - runbook
  - phase-03

must_haves:
  truths:
    - 'Boot-time `assertSystemRolesPresent(auth)` asserts the BA accessControl map contains exactly owner/admin/staff with permissions matching SYSTEM_ROLES; throws SystemRoleDriftError listing the diff on mismatch'
    - 'main.ts calls assertSystemRolesPresent(auth) after buildAuth() and before module bootstrap, mirroring assertProdGuardrails wiring'
    - 'Regression test pins owner > admin > staff containment AND that admin does NOT receive tenant:delete, tenant:transfer, staff:role:create'
    - "NO migration on `organization_role` table — static presets are NOT seeded into DB; the table remains BA's DYNAMIC tenant-creatable storage"
    - 'organizationHooks.afterUpdateMemberRole is wired in auth.config.ts; on every BA-driven role mutation it emits identity.role_changed.v1 envelope through buildEnvelope + appendToOutbox via db.withTenantId'
    - "ACTION_TARGET_KIND['identity.role_changed']='user' added in audit projection map"
    - 'audit-gap.md BLOCKED row for role-change is updated to WIRED with reference to organizationHooks.afterUpdateMemberRole at auth.config.ts:<resolved_line>'
    - "auth.config.ts no longer contains 'as { __restoSignOut' or 'as unknown as' casts on the context-stash pattern; replaced with WeakMap<object, SignOutStash> + WeakMap<object, PasswordResetStash>"
    - 'Sign-out + password-reset audit envelopes still emit correctly after WeakMap refactor (regression e2e against identity-audit.e2e.spec.ts)'
    - "Daily GDPR cron deletes invitation rows where expires_at < now() - 30d AND status IN ('expired','revoked','accepted')"
    - 'Daily GDPR cron deletes verification rows where expires_at < now() - 1h (BA deletes on consumption; this catches abandoned flows)'
    - 'GDPR sweep lives in apps/api/src/infrastructure/jobs/ as new sibling scheduler services mirroring tenant-erasure-scheduler.service.ts shape (NestJS @Injectable + @Cron(EVERY_DAY_AT_3AM))'
    - 'RATE_LIMIT_AUTH_SIGNIN_PER_TENANT_PER_MIN env wired into signin route; per-tenant bucket extracted from x-tenant-slug or BA organizationId'
    - 'infra/runbooks/2fa-recovery.md exists with SQL script reset-2fa.ts referenced; founder can disable 2FA + write audit row + revoke sessions for an account'
    - 'infra/runbooks/spf-dkim-dmarc-checklist.md exists with the resto.app DNS verification steps per D-07'
  artifacts:
    - path: 'apps/api/src/bootstrap/assert-system-roles-present.ts'
      provides: 'Boot-time drift guard for BA accessControl ↔ SYSTEM_ROLES; throws SystemRoleDriftError'
      min_lines: 30
    - path: 'apps/api/src/contexts/identity/infrastructure/better-auth/auth.config.ts'
      provides: 'organizationHooks.afterUpdateMemberRole emitting identity.role_changed.v1 + WeakMap refactor of stash pattern'
      contains: 'afterUpdateMemberRole'
    - path: 'packages/events/src/contracts/identity.ts'
      provides: 'IdentityRoleChangedV1 contract'
      contains: 'identity.role_changed.v1'
    - path: 'test/unit/system-roles-presets.spec.ts'
      provides: 'Regression: owner > admin > staff containment + admin denied-permissions pins'
    - path: 'apps/api/test/e2e/identity-role-changed.e2e.spec.ts'
      provides: 'BA-driven role mutation triggers hook → audit row materializes'
    - path: '.planning/phases/01-tenancy-hardening/audit-gap.md'
      provides: 'role-change BLOCKED row → WIRED row with auth.config.ts reference'
      contains: 'WIRED'
    - path: 'infra/runbooks/2fa-recovery.md'
      provides: 'Founder-side 2FA recovery SQL runbook (D-23)'
    - path: 'infra/runbooks/spf-dkim-dmarc-checklist.md'
      provides: 'Pre-deploy DNS checklist for resto.app (D-07)'
  key_links:
    - from: 'apps/api/src/bootstrap/assert-system-roles-present.ts'
      to: 'packages/domain/src/rbac/system-roles.ts SYSTEM_ROLES'
      via: 'deep-equality assertion at boot against BA accessControl map'
      pattern: 'SYSTEM_ROLES'
    - from: 'apps/api/src/contexts/identity/infrastructure/better-auth/auth.config.ts'
      to: 'identity.role_changed.v1 outbox emission'
      via: 'buildEnvelope + appendToOutbox via db.withTenantId in afterUpdateMemberRole hook'
      pattern: "identity\\.role_changed\\.v1"
    - from: 'apps/api/src/contexts/audit/application/record-audit.service.ts'
      to: 'identity.role_changed → user'
      via: 'ACTION_TARGET_KIND map entry'
      pattern: "identity\\.role_changed.*user"
    - from: '.planning/phases/01-tenancy-hardening/audit-gap.md'
      to: 'auth.config.ts:<resolved_line>'
      via: 'WIRED transition note referencing afterUpdateMemberRole'
      pattern: 'afterUpdateMemberRole'
---

<objective>
This is the closure plan. It ships AUTH-09 (the dual deliverable per D-16a as
REINTERPRETED per plan-checker B-4 2026-05-30 + RESEARCH.md Open Question 1
RESOLVED): a boot-time drift guard `assertSystemRolesPresent` that pins the
BA accessControl map against `SYSTEM_ROLES` exactly (NO DB migration — static
presets live in code at `access-control.ts:6-9` + `auth.config.ts:148-153`,
NOT in the `organization_role` table which is BA's DYNAMIC tenant-creatable
role storage); AND wiring organizationHooks.afterUpdateMemberRole (the
research overturned the earlier "BA ≥ 1.5 hook" narrative by confirming the
hook EXISTS in BA 1.4.22 at types.d.mts:520).

Also ships AUTH-11 (WeakMap refactor opportunistic with the auth.config.ts
mod already happening for AUTH-09), D-21 (GDPR daily sweep on invitation +
verification per RESEARCH.md Open Question 2 RESOLVED — new sibling
scheduler services under BackgroundJobsModule), D-20 (per-tenant signin
rate-limit env wiring — env added in Plan 02 Task 1, enforcement here),
D-23 (founder-side 2FA recovery runbook + SQL script), D-07 (SPF/DKIM/DMARC
pre-deploy checklist), and the explicit audit-gap.md update closing the
BLOCKED disposition from Phase 1.

Purpose: Phase 3 closure with no remaining loose ends. After this plan
all 11 AUTH-\* requirements complete, the audit-gap.md BLOCKED row from
Phase 1 transitions to WIRED, the GDPR retention story extends to the
two BA-owned tables, and the operational runbooks land for the documented
manual paths (2FA recovery, DNS configuration).

Output: working boot-time drift guard, working role-change audit hook,
WeakMap-clean context-stash, daily GDPR sweep extension as proper
NestJS @Cron schedulers, per-tenant rate-limit enforcement, runbooks,
and a closed audit-gap row.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/phases/03-auth-completion/03-CONTEXT.md
@.planning/phases/03-auth-completion/03-RESEARCH.md
@.planning/phases/03-auth-completion/03-01-SUMMARY.md
@.planning/phases/03-auth-completion/03-02-SUMMARY.md
@.planning/phases/01-tenancy-hardening/audit-gap.md
@packages/CLAUDE.md
@packages/events/CLAUDE.md
@packages/domain/CLAUDE.md
@packages/domain/src/rbac/system-roles.ts
@packages/domain/src/rbac/permissions.ts
@apps/api/src/contexts/identity/infrastructure/better-auth/access-control.ts
@apps/api/src/contexts/identity/infrastructure/better-auth/auth.config.ts
@apps/api/src/contexts/audit/application/record-audit.service.ts
@apps/api/src/contexts/identity/infrastructure/identity-event-emitter.adapter.ts
@apps/api/src/infrastructure/background-jobs.module.ts
@apps/api/src/config/env.schema.ts

<interfaces>
<!-- Extracted from research + verified BA 1.4.22 contracts + plan-checker 2026-05-30 resolutions. -->

D-16 + D-16a (AUTH-09 dual deliverable — REINTERPRETED per B-4):

SYSTEM_ROLES (existing — verified at packages/domain/src/rbac/system-roles.ts:10-34):
export const SYSTEM_ROLES: Record<'owner'|'admin'|'staff', readonly Permission[]> = { ... };

BA access-control wiring (verified by orchestrator scout 2026-05-30):
apps/api/src/contexts/identity/infrastructure/better-auth/access-control.ts:6-9 declares:
const owner = ac.newRole(SYSTEM_ROLES.owner);
const admin = ac.newRole(SYSTEM_ROLES.admin);
const staff = ac.newRole(SYSTEM_ROLES.staff);
auth.config.ts:148-153 passes them to organization({ roles: { owner, admin, staff } }) — BA holds them as in-memory accessControl entries; NO DB migration is required for these system presets.

BA organization_role table (NOT the seed target — kept dynamic):
packages/db/src/schema/auth.ts `organizationRole` table — columns: id (text PK), organizationId (uuid NOT NULL → tenants.id ON DELETE CASCADE), role (text), permission (text), createdAt, updatedAt. This table is BA's DYNAMIC tenant-creatable role storage where tenants can define custom roles BEYOND owner/admin/staff. AUTH-09 does NOT touch this schema. Per RESEARCH.md Open Question 1 RESOLVED.

assertSystemRolesPresent pattern (new, mirrors assertProdGuardrails):
export function assertSystemRolesPresent(auth: BetterAuthInstance): void
Reads the in-memory accessControl map from the constructed BA instance, asserts: 1. Exactly three role keys: 'owner', 'admin', 'staff' (no extras, no missing). 2. For each role, the permission statement matches SYSTEM_ROLES[role] exactly (deep equality — use packages/domain SYSTEM_ROLES as source of truth).
Throws SystemRoleDriftError listing the diff if assertion fails. Wired in main.ts after buildAuth() and before app.listen(), matching the assertProdGuardrails call site shape.

D-16a — organizationHooks.afterUpdateMemberRole signature (verified node_modules/better-auth@1.4.22/.../organization/types.d.mts:506-525):
afterUpdateMemberRole?: (data: {
member: Member; // member.organizationId, member.userId, member.role (NEW role)
previousRole: string; // PREVIOUS role string
user: User; // affected user
organization: Organization; // org context
}) => Promise<void> | void;

Pattern (mirrors onSignedOut at auth.config.ts:259-307):
organizationHooks: {
afterUpdateMemberRole: async ({ member, previousRole, user, organization }) => {
const tenantId = TenantId.parse(member.organizationId);
await db.withTenantId(tenantId, async (tx) => {
const envelope = buildEnvelope({
type: 'identity.role_changed.v1',
payload: {
userId: user.id,
tenantId,
previousRole,
newRole: member.role,
actorUserId: ctxActor?.id, // best-effort from BA context; null/absent OK
},
});
await appendToOutbox(tx, envelope, aggregateId: user.id);
});
},
}

IMPORTANT (per plan-checker W-2 2026-05-30): The hook is wired INLINE within buildAuth() — it does NOT go through BuildOpts because no external injection is needed. The audit emit pipeline (db + buildEnvelope + appendToOutbox) is all available in module scope where buildAuth() runs. This mirrors how onSignedOut and onPasswordResetCompleted are wired at auth.config.ts:259-307. Do NOT extend BuildOpts with a new injection field.

IdentityRoleChangedV1 contract (NEW — add to packages/events/src/contracts/identity.ts):
payload: { userId: z.string().uuid(), tenantId: TenantId, previousRole: z.string().max(64), newRole: z.string().max(64), actorUserId: z.string().uuid().optional() }

ACTION_TARGET_KIND map (extend apps/api/src/contexts/audit/application/record-audit.service.ts:7-22):
Add: 'identity.role_changed': 'user'

AUTH-11 WeakMap refactor (D-22 retain, opportunistic — verified RESEARCH.md "Pattern 5"):
At auth.config.ts:222-256 (signed-out stash) AND :264-307 (password-reset stash):
Current: `(ctx.context as { __restoSignOut?: ... }).__restoSignOut = { ... }`
Target:
interface SignOutStash { readonly userId: string; readonly tenantId: string; readonly sessionId: string; }
interface PasswordResetStash { readonly userId: string; readonly sessionCount: number; }
const signOutStash = new WeakMap<object, SignOutStash>();
const passwordResetStash = new WeakMap<object, PasswordResetStash>();
All `as unknown as` and `as { __resto* }` casts removed.

D-21 GDPR sweep (per RESEARCH.md Open Question 2 RESOLVED 2026-05-30):
Path: apps/api/src/infrastructure/background-jobs.module.ts with sibling per-job service files. Existing precedent: tenant-erasure-scheduler.service.ts. Add two new sibling files (or one consolidated auth-token-retention-scheduler.service.ts) registered in BackgroundJobsModule.providers. Mirror the existing scheduler shape: NestJS @Injectable() + @Cron(CronExpression.EVERY_DAY_AT_3AM) decorator. Each scheduler runs under db.withoutTenant('GDPR retention sweep — invitation') and db.withoutTenant('GDPR retention sweep — verification') respectively — both reason strings + the new scheduler file paths must be registered in the TEN-11 allowlist (packages/db/src/withoutTenant.allowlist.ts) AND the corresponding ESLint per-file override block (apps/api/eslint.config.mjs) per Plan 01 Task 2b precedent.
Queries:
DELETE FROM invitation WHERE expires_at < now() - INTERVAL '30 days' AND status IN ('expired','revoked','accepted')
DELETE FROM verification WHERE expires_at < now() - INTERVAL '1 hour' -- buffer over BA's deletion-on-consumption (Pitfall 6)

D-20 per-tenant signin rate-limit:
env added in Plan 02 Task 1 (RATE_LIMIT_AUTH_SIGNIN_PER_TENANT_PER_MIN, default 60)
Implementation: add middleware OR guard on the sign-in route that extracts tenant from x-tenant-slug header (Phase 1 mechanism) or from BA organizationId being signed into; per-tenant rate-limit bucket via existing rate-limit infrastructure; on miss fall back to per-IP + per-email (existing buckets at env.schema.ts:174 + :181)
Bucket key shape: `signin:tenant:<tenantId>:minute:<YYYY-MM-DD-HH-mm>`
Per D-06 second clause: 429 timing parity — burst-rejected requests must NOT divulge per-tenant boundary by faster response than allowed (use same time-equalize approach as signup parity)

D-23 founder-side 2FA recovery runbook:
infra/runbooks/2fa-recovery.md documents: - Verify operator's identity out-of-band (phone, video call) - Run `pnpm exec tsx scripts/reset-2fa.ts --user-id <UUID>` which:
a. UPDATE user SET twoFactorEnabled = false WHERE id = ?
b. DELETE FROM two_factor WHERE userId = ?
c. DELETE FROM session WHERE userId = ? (force re-login)
d. INSERT audit_log row with action='identity.two_factor_reset_manual', actorSubject='founder:manual', targetType='user', targetId=userId, payload={reason:'lost-device-recovery'} - Document that this is sole-owner recovery path; subordinate-reset moves to Phase 17 / TEAM-04

D-07 SPF/DKIM/DMARC checklist (committed runbook):
infra/runbooks/spf-dkim-dmarc-checklist.md documents pre-deploy DNS verification for resto.app: 1. SPF: TXT @ "v=spf1 include:\_spf.resend.com -all" 2. DKIM: TXT resend.\_domainkey "v=DKIM1; k=rsa; p=<from Resend Dashboard>" 3. DMARC: TXT \_dmarc "v=DMARC1; p=quarantine; rua=mailto:dmarc-reports@resto.app" 4. Verify via dig + mail-tester.com before first Phase 3 deploy

regression test (packages/domain/CLAUDE.md "Adding a permission requires regression"):
test/unit/system-roles-presets.spec.ts asserts owner > admin > staff containment AND that admin does NOT contain 'tenant:delete', 'tenant:transfer', 'staff:role:create' permissions (RBAC drift guard). Also asserts staff is read-only on tenant/brand.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: AUTH-09 system role preset verification + boot-time drift guard (per plan-checker B-4 2026-05-30 — NO DB migration)</name>
  <read_first>
    - packages/domain/src/rbac/system-roles.ts (canonical SYSTEM_ROLES map — owner, admin, staff)
    - packages/domain/src/rbac/permissions.ts (Permission type + token list — for deep-equality comparison)
    - apps/api/src/contexts/identity/infrastructure/better-auth/access-control.ts (in-code preset injection at lines 6-9 — `ac.newRole(SYSTEM_ROLES.owner/admin/staff)`)
    - apps/api/src/contexts/identity/infrastructure/better-auth/auth.config.ts:148-153 (organization() plugin roles param — verifies presets reach BA)
    - apps/api/src/bootstrap/ (existing boot-time assertions: assertNoRlsBypass, assertTenantLockInstalled, assertSetConfigRevoked, assertProdGuardrails — pattern to mirror; file naming convention; export shape)
    - apps/api/src/main.ts (boot sequence — confirm where to insert assertSystemRolesPresent(auth) call: after buildAuth() and before app.listen())
    - apps/api/src/contexts/identity/identity-core.module.ts (no change here; the assert is invoked from main.ts, not via NestJS bootstrap lifecycle)
    - packages/domain/CLAUDE.md "Adding a permission to admin requires a passing regression test that pins what admin must NOT receive" rule
  </read_first>
  <behavior>
    - Test 1: IdentityRoleChangedV1 contract exports with payload schema { userId, tenantId, previousRole, newRole, actorUserId? }
    - Test 2: ACTION_TARGET_KIND['identity.role_changed']='user' added; deriveTargetType returns 'user' for this action prefix
    - Test 3: assertSystemRolesPresent(auth) passes silently when the BA accessControl map matches SYSTEM_ROLES exactly (owner/admin/staff with the canonical permission sets)
    - Test 4: assertSystemRolesPresent throws SystemRoleDriftError listing the diff when a role permission is removed in the BA map (drift detection — simulated by constructing a mock auth with admin missing a permission)
    - Test 5: assertSystemRolesPresent throws when an extra role key appears in the BA map (e.g., 'superadmin' beyond the canonical three)
    - Test 6 (regression — packages/domain/CLAUDE.md mandate): SYSTEM_ROLES.admin does NOT contain 'tenant:delete', 'tenant:transfer', nor 'staff:role:create' permissions
    - Test 7 (regression — containment shape): owner contains every admin permission AND additionally contains 'staff:role:create'; admin contains every staff permission AND additionally contains brand/tenant write permissions appropriate to its tier; staff is read-only on tenant/brand
    - Test 8: main.ts startup sequence — when SYSTEM_ROLES is deliberately misconfigured (test override), the process throws SystemRoleDriftError BEFORE app.listen() is called (caught at boot, not at first request)
  </behavior>
  <action>
    Step A — Add IdentityRoleChangedV1 to packages/events/src/contracts/identity.ts following the existing defineEventContract pattern. Payload Zod schema per interfaces block. Re-export from packages/events/src/index.ts. Extend ACTION_TARGET_KIND map in apps/api/src/contexts/audit/application/record-audit.service.ts to include 'identity.role_changed': 'user'.

    Step B — Create apps/api/src/bootstrap/assert-system-roles-present.ts exporting `assertSystemRolesPresent(auth: BetterAuthInstance): void`. Implementation:
      1. Read the in-memory accessControl map from the constructed BA instance (the auth object exposes the registered roles via `auth.options.plugins` → organization plugin → roles, OR via the access-control module exports — pick whichever surface the existing code uses; if neither is ergonomic, import the `owner`/`admin`/`staff` constants directly from access-control.ts and assert against them since they ARE the source of truth fed to BA at construction time).
      2. Assert exactly three role keys: 'owner', 'admin', 'staff'. Use Object.keys equality (sorted) against SYSTEM_ROLES keys; if extra/missing throw SystemRoleDriftError with the diff.
      3. For each role, compare the registered permission statement against SYSTEM_ROLES[role] using deep equality (e.g., sorted array equality OR a Set-based subset+superset check that survives reordering).
      4. On mismatch throw SystemRoleDriftError with `cause: { expected: SYSTEM_ROLES, actual: registered, diff: [...] }` so the boot log shows exactly which permission drifted.

    Define SystemRoleDriftError as a plain Error subclass in the same file with constructor setting this.name = 'SystemRoleDriftError'.

    Step C — Wire main.ts to call assertSystemRolesPresent(auth) after buildAuth() and before NestJS module bootstrap (so the failure surfaces during boot, not at first request). Follow the assertProdGuardrails call-site shape — that function is already called near the top of main.ts; place assertSystemRolesPresent immediately after it. Both throw synchronously and stop the boot.

    Step D — Create test/unit/system-roles-presets.spec.ts (NestJS-free unit test runnable via vitest):
      - Test 6: pins admin denied permissions per packages/domain/CLAUDE.md regression rule — explicit assertions that 'tenant:delete', 'tenant:transfer', 'staff:role:create' are NOT in SYSTEM_ROLES.admin.
      - Test 7: pins containment shape — owner ⊇ admin ⊇ staff in terms of permission tokens; staff is read-only on tenant/brand.
      - Test 3-5: construct mock BA accessControl maps (matching, drifted-missing, drifted-extra) and assert assertSystemRolesPresent passes / throws SystemRoleDriftError with expected diff content.

    Step E — Add boot-sequence integration test apps/api/test/identity-boot-system-roles.spec.ts (extend existing apps/api/test/identity-boot-integration.spec.ts from Plan 02 Task 4 if structurally similar). Test 8: deliberately mutate SYSTEM_ROLES via a vitest module mock so that the BA accessControl map drifts; bootstrap the app; assert the boot throws SystemRoleDriftError BEFORE app.listen() resolves. This is the production-misconfiguration regression net.

    Step F — Document the design clarification at the top of the assertSystemRolesPresent file:
      // AUTH-09 D-16 REINTERPRETED 2026-05-30 (plan-checker B-4): `organization_role` table is BA's DYNAMIC
      // tenant-creatable role storage, NOT static preset storage. Static presets (owner/admin/staff) live in
      // apps/api/src/contexts/identity/infrastructure/better-auth/access-control.ts:6-9 and are wired at BA
      // init via the organization() plugin's `roles` param at auth.config.ts:148-153. This function is the
      // drift guard that ensures the in-code presets continue to match SYSTEM_ROLES on every boot.

    NB: This task does NOT modify packages/db/src/schema/auth.ts. There is NO SQL migration for AUTH-09. If the executor finds themselves writing Drizzle table mods, they have misunderstood the reinterpretation — re-read this action block.

    Step G — Per RESEARCH.md Open Question 1 RESOLVED clause (c): confirm BA's `organization.create` server-side action assigns the operator as `owner` by default. Read once: node_modules/better-auth/.../organization/routes/crud-org.mjs (specifically the create handler). If the default owner-assignment is implicit (no per-tenant configuration needed), record the finding in 03-05-SUMMARY.md with a one-line confirmation. If the default needs an explicit creatorRole config, set it on the organization() plugin at auth.config.ts:148-153.

  </action>
  <verify>
    <automated>pnpm --filter @resto/events test contracts/identity</automated>
    <automated>pnpm exec vitest run test/unit/system-roles-presets.spec.ts</automated>
    <automated>pnpm --filter @resto/api test identity-boot-system-roles</automated>
    <automated>pnpm --filter @resto/api typecheck</automated>
    <automated>grep -c "organizationRole" packages/db/src/schema/auth.ts</automated>
  </verify>
  <done>
    IdentityRoleChangedV1 contract exported; ACTION_TARGET_KIND extended; apps/api/src/bootstrap/assert-system-roles-present.ts exports assertSystemRolesPresent(auth) + SystemRoleDriftError; main.ts calls assertSystemRolesPresent(auth) after buildAuth() and before app.listen(); regression test pins owner > admin > staff containment AND admin denied permissions (tenant:delete, tenant:transfer, staff:role:create); deliberately misconfigured SYSTEM_ROLES throws SystemRoleDriftError at boot; packages/db/src/schema/auth.ts is NOT modified (no migration for AUTH-09 — grep shows the existing organizationRole table unchanged); RESEARCH.md Open Question 1 clause (c) confirmation recorded in SUMMARY.md.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: organizationHooks.afterUpdateMemberRole wiring + WeakMap refactor + audit-gap.md update + identity-role-changed e2e</name>
  <read_first>
    - apps/api/src/contexts/identity/infrastructure/better-auth/auth.config.ts (entire file — especially lines 222-256 sign-out stash, 264-307 password-reset stash, and the organization() plugin block at 148-153 where afterUpdateMemberRole goes)
    - apps/api/src/contexts/identity/infrastructure/identity-event-emitter.adapter.ts:30 (db.withTenantId pattern precedent — same shape used by hook)
    - packages/events/src/envelope.ts (buildEnvelope signature — correlationId from OTel)
    - packages/events/src/outbox/repository.ts (appendToOutbox signature)
    - apps/api/test/e2e/identity-audit.e2e.spec.ts (test harness — extends pattern for new role-change spec)
    - .planning/phases/01-tenancy-hardening/audit-gap.md (BLOCKED row at line 16; must update to WIRED with auth.config.ts reference + remove the stale "BA ≥ 1.5 trigger" narrative per CONTEXT D-16a)
    - .planning/phases/03-auth-completion/03-RESEARCH.md "Verification findings Item 20" (organizationHooks.afterUpdateMemberRole EXISTS in 1.4.22 — types.d.mts:506-525 verified)
    - .planning/phases/03-auth-completion/03-RESEARCH.md "Pattern 5" (WeakMap refactor template)
  </read_first>
  <behavior>
    - Test 1 (e2e): triggering BA's auth.api.updateMemberRole with valid actor → afterUpdateMemberRole fires → identity.role_changed.v1 envelope lands on outbox table (verify via direct Drizzle read) within 1 second; payload has userId, tenantId, previousRole, newRole correctly populated
    - Test 2 (e2e): the envelope flows through OutboxDispatcher → NATS → NatsAuditSubscriber → audit_log row materializes with action='identity.role_changed.v1', targetType='user', targetId=<changed-member-userId>
    - Test 3 (e2e): hook uses db.withTenantId (RLS enforced); cross-tenant write would fail (verify by mocking an attacker scenario that tries to swap tenantId mid-call)
    - Test 4 (e2e regression — Test from Plan 04 Task 2 sign-out still works): existing identity-audit.e2e.spec.ts 'records identity.signed_out.v1' test STILL PASSES after WeakMap refactor (regression net for AUTH-11)
    - Test 5 (e2e regression — password-reset cascade still fires): existing identity-audit.e2e.spec.ts 'records identity.password_reset_completed.v1' test STILL PASSES after WeakMap refactor
    - Test 6: grep 'as unknown as.*__resto' in auth.config.ts returns 0 matches (cast eliminated)
    - Test 7: grep 'WeakMap<object' in auth.config.ts returns at least 2 matches (signOutStash + passwordResetStash)
    - Test 8: audit-gap.md BLOCKED row at the role-change identity line is updated to 'WIRED' with reference to auth.config.ts:<line> + the resolved organizationHooks.afterUpdateMemberRole narrative
  </behavior>
  <action>
    Step A — In apps/api/src/contexts/identity/infrastructure/better-auth/auth.config.ts: above existing sign-out hook section (~line 222), add the two WeakMap declarations per RESEARCH.md Pattern 5: signOutStash and passwordResetStash typed as WeakMap<object, SignOutStash | PasswordResetStash>. Refactor the two stash sites (sign-out hooks.before/after at L222-256, password-reset hooks.before/after at L264-307) to use signOutStash.set(ctx.context, ...) / signOutStash.get(ctx.context) / signOutStash.delete(ctx.context) (and same shape for passwordResetStash). Remove the `(ctx.context as { __restoSignOut?: ... }).__restoSignOut` casts entirely. The hook bodies (envelope construction + appendToOutbox) preserve the existing logic — Plan 01-04 should already have these working; this refactor is contract-preserving.

    Step B — Wire organizationHooks.afterUpdateMemberRole in the organization() plugin block. Pattern per interfaces block above: hook callback receives ({ member, previousRole, user, organization }), parses TenantId from member.organizationId, calls db.withTenantId(tenantId, async (tx) => { const envelope = buildEnvelope({ type: 'identity.role_changed.v1', payload: { userId: user.id, tenantId, previousRole, newRole: member.role, actorUserId: ... } }); await appendToOutbox(tx, envelope, user.id); }). Best-effort actorUserId derivation: BA passes the calling user context implicitly via ctx; if not available leave optional (the contract allows undefined). PRESERVE the existing `requireEmailVerificationOnInvitation: true` option set in Plan 02 Task 3.

    NOTE per plan-checker W-2 2026-05-30: The hook is wired INLINE within buildAuth() — it does NOT go through BuildOpts because no external injection is needed (audit emit uses db + buildEnvelope + appendToOutbox, all available in module scope). This mirrors how onSignedOut and onPasswordResetCompleted are wired at auth.config.ts:259-307. Do NOT extend BuildOpts with a new injection field.

    Step C — Create apps/api/test/e2e/identity-role-changed.e2e.spec.ts. Tests 1-3 above. Triggers role change via auth.api.updateMemberRole (BA's server-side API verified at crud-members.mjs:211). Assert outbox row directly via Drizzle; assert audit_log row after waiting for OutboxDispatcher tick. Test 3 (cross-tenant attempt) uses RLS guard — try to publish with a different tenantId in payload and assert the insert is rejected by RLS.

    Step D — Update .planning/phases/01-tenancy-hardening/audit-gap.md: change the BLOCKED row for role-change (line 16) to WIRED. Replace the "BLOCKED — Better Auth member-plugin role-mutation hook surface not available in 1.4.22" narrative with: "WIRED — Phase 3 / Plan 05 / Task 2 wired `organizationHooks.afterUpdateMemberRole` in `apps/api/src/contexts/identity/infrastructure/better-auth/auth.config.ts:<line>`. The hook exists in BA 1.4.22 at `node_modules/.pnpm/better-auth@1.4.22/.../organization/types.d.mts:506-525` — the earlier 'BA ≥ 1.5 trigger' narrative was based on a wrong hook path. Emits `identity.role_changed.v1` envelope via `buildEnvelope` + `appendToOutbox` via `db.withTenantId`. `ACTION_TARGET_KIND['identity.role_changed']='user'` added in `apps/api/src/contexts/audit/application/record-audit.service.ts`. E2e proof: `apps/api/test/e2e/identity-role-changed.e2e.spec.ts`." Update the BLOCKED row tracking section (lines 30-34) to reflect that the row is now WIRED and Phase 17 / TEAM-03 ships UI-only on top.

    Step E — Ensure the existing identity-audit.e2e.spec.ts tests for sign-out + password-reset still pass after WeakMap refactor (Tests 4 + 5 above). If any test breaks due to stash type changes, the regression is in the refactor — fix it before claiming done.

  </action>
  <verify>
    <automated>pnpm --filter @resto/api test:e2e identity-role-changed</automated>
    <automated>pnpm --filter @resto/api test:e2e identity-audit</automated>
    <automated>grep -c "as unknown as" apps/api/src/contexts/identity/infrastructure/better-auth/auth.config.ts</automated>
    <automated>grep -c "WeakMap&lt;object" apps/api/src/contexts/identity/infrastructure/better-auth/auth.config.ts</automated>
    <automated>grep -c "afterUpdateMemberRole" apps/api/src/contexts/identity/infrastructure/better-auth/auth.config.ts</automated>
    <automated>grep -v '^#' .planning/phases/01-tenancy-hardening/audit-gap.md | grep -c "BLOCKED"</automated>
    <automated>grep -c "WIRED" .planning/phases/01-tenancy-hardening/audit-gap.md</automated>
  </verify>
  <done>
    organizationHooks.afterUpdateMemberRole wired with the buildEnvelope + appendToOutbox + db.withTenantId pattern; e2e role-changed spec asserts envelope + audit row + RLS isolation; WeakMap refactor complete (`as unknown as` casts gone, WeakMap declarations present ≥2); audit-gap.md role-change row updated to WIRED with explicit reference to auth.config.ts hook and IdentityRoleChangedV1 contract; existing sign-out + password-reset audit regression e2es still green; hook wired inline within buildAuth() (no BuildOpts extension).
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: GDPR sweep (BackgroundJobsModule schedulers) + per-tenant signin rate-limit + runbooks (2FA recovery + SPF/DKIM/DMARC)</name>
  <read_first>
    - apps/api/src/infrastructure/background-jobs.module.ts (existing module per RESEARCH.md Open Question 2 RESOLVED — read providers list + import structure)
    - apps/api/src/infrastructure/jobs/ (or wherever tenant-erasure-scheduler.service.ts lives — mirror its shape exactly: @Injectable + @Cron decorator + db.withoutTenant call site)
    - apps/api/src/middleware/ (existing rate-limit middleware — extend for per-tenant bucket)
    - apps/api/src/config/env.schema.ts (RATE_LIMIT_AUTH_SIGNIN_PER_TENANT_PER_MIN added in Plan 02 Task 1)
    - apps/api/test/e2e/gdpr-retention.e2e.spec.ts OR equivalent existing Phase 1 retention spec — extend with invitation+verification cases
    - packages/db/src/withoutTenant.allowlist.ts (TEN-11 allowlist — add the two new scheduler file paths)
    - apps/api/eslint.config.mjs (matching per-file override blocks — mirror existing entries for tenant-erasure scheduler)
    - .planning/phases/03-auth-completion/03-RESEARCH.md "Common Pitfalls" Pitfall 6 (verification table grows unboundedly)
    - .planning/phases/03-auth-completion/03-CONTEXT.md D-20 (per-tenant rate-limit; D-21 GDPR sweep; D-23 2FA runbook; D-07 DNS checklist)
    - packages/db/src/schema/ (find invitation + verification table definitions if not in auth.ts)
  </read_first>
  <behavior>
    - Test 1 (e2e): GDPR cron run deletes invitation rows where expires_at < now() - 30d AND status IN ('expired','revoked','accepted'); preserves invitation rows with status='pending' regardless of age (Skeptic MED-9 admin needs visibility on bouncing pending invites)
    - Test 2 (e2e): GDPR cron run deletes verification rows where expires_at < now() - 1h (1h buffer over BA's deletion-on-consumption per Pitfall 6 — avoids race with in-flight reset clicks)
    - Test 3 (e2e): Job runs under db.withoutTenant('GDPR retention sweep — invitation') and db.withoutTenant('GDPR retention sweep — verification') — verify the call sites are in the TEN-11 allowlist AND matching ESLint override blocks exist
    - Test 4 (e2e): per-tenant signin rate-limit hits at RATE_LIMIT_AUTH_SIGNIN_PER_TENANT_PER_MIN+1 requests/min for a single tenant; falls back to per-IP + per-email when tenant cannot be resolved
    - Test 5 (e2e): 429 response from per-tenant rate-limit returns same response shape AND same timing (±10ms) as 429 from per-IP/per-email per D-06 second clause (no enumeration via rate-limit boundary divergence)
    - Test 6: infra/runbooks/2fa-recovery.md exists and references scripts/reset-2fa.ts
    - Test 7: scripts/reset-2fa.ts exists as a tsx CLI that takes --user-id flag, prints SQL preview, prompts for confirmation, and on confirm executes the 4-step SQL (UPDATE user.twoFactorEnabled=false; DELETE two_factor row; DELETE session rows; INSERT audit_log row with action='identity.two_factor_reset_manual')
    - Test 8: infra/runbooks/spf-dkim-dmarc-checklist.md exists with the 4 documented DNS records for resto.app + dig + mail-tester verification steps
  </behavior>
  <action>
    Step A — Per RESEARCH.md Open Question 2 RESOLVED: create two new sibling scheduler services under apps/api/src/infrastructure/jobs/ (or wherever tenant-erasure-scheduler.service.ts lives — mirror exactly):
      - apps/api/src/infrastructure/jobs/invitation-retention-scheduler.service.ts
      - apps/api/src/infrastructure/jobs/verification-retention-scheduler.service.ts
    (If a single consolidated `auth-token-retention-scheduler.service.ts` is structurally cleaner, ship that instead — document the choice in 03-05-SUMMARY.md.) Each scheduler: NestJS @Injectable() + @Cron(CronExpression.EVERY_DAY_AT_3AM) decorator. Inject the Drizzle db handle. Each cron method runs under db.withoutTenant('GDPR retention sweep — invitation') or db.withoutTenant('GDPR retention sweep — verification') respectively (distinct reason strings — both must be allowlist-friendly).

    Step B — Register the new providers in apps/api/src/infrastructure/background-jobs.module.ts (append to the existing providers array; do not remove tenant-erasure-scheduler.service.ts).

    Step C — TEN-11 allowlist registration for the new scheduler files (per Plan 01 Task 2b precedent):
      - Edit packages/db/src/withoutTenant.allowlist.ts: add the two new file paths (or one consolidated path) to WITHOUT_TENANT_ALLOWLIST.
      - Edit apps/api/eslint.config.mjs: add matching per-file override block(s) mirroring the existing block for tenant-erasure-scheduler.service.ts.
      - Run test/unit/withoutTenant-allowlist.spec.ts; bump any explicit length assertion.

    Step D — SQL: invitation sweep `DELETE FROM invitation WHERE expires_at < now() - INTERVAL '30 days' AND status IN ('expired','revoked','accepted')` — exclude 'pending' status (per Skeptic MED-9 visibility on bouncing pending invites; D-08 bounce-handler deferred so pending stays visible). Verification sweep `DELETE FROM verification WHERE expires_at < now() - INTERVAL '1 hour'` (buffer over consumption-side delete). Use Drizzle's delete-API; raw SQL only if Drizzle cannot express the predicate.

    Step E — Extend (or create) apps/api/test/e2e/gdpr-retention.e2e.spec.ts with Tests 1-3 above. Insert fixture invitation rows in multiple statuses + ages; trigger the cron method directly (NestJS testing module); assert expected rows remain/disappear. Insert fixture verification rows past + future TTL; trigger; assert.

    Step F — Add per-tenant signin rate-limit middleware. The env RATE_LIMIT_AUTH_SIGNIN_PER_TENANT_PER_MIN was added in Plan 02. Create apps/api/src/middleware/per-tenant-signin-rate-limit.ts (or extend existing rate-limit guard if collocated). Extract tenant from incoming sign-in request: try x-tenant-slug header → resolve to tenantId via tenancy resolver; if absent, try BA body.organizationId; if both miss, fall back to existing per-IP + per-email buckets only. Bucket key shape per interfaces block. Implementation matches existing rate-limit infrastructure pattern (likely Redis-backed) — use the existing rateLimiter port if present, OR introduce a new Symbol if rate-limit is a per-call concern. On rate-limit miss, return 429 with the SAME body shape + ±10ms timing as the per-IP/per-email path (D-06 second clause). Implementation note: time-equalize the 429 branch by running a constant-time delay loop calibrated to match the happy-path average.

    Step G — Write apps/api/test/e2e/per-tenant-signin-rate-limit.e2e.spec.ts covering Test 4 + Test 5 (rate-limit hit + 429 timing parity).

    Step H — Create infra/runbooks/2fa-recovery.md (D-23). Document the founder-side recovery procedure: identity verification out-of-band → run scripts/reset-2fa.ts → confirm SQL preview → executed UPDATE/DELETE/INSERT in single transaction → operator can re-enable 2FA on next login. Include the operator-comms script ("Hi <operator>, we've disabled 2FA on your account; please re-enable it from /dashboard/settings as soon as you sign in. The reset has been audited."). Create scripts/reset-2fa.ts as a tsx CLI: arguments --user-id (UUID) and --dry-run flag. Prints the SQL preview, the affected rows count, prompts y/N confirmation, on confirm executes inside a transaction. Uses postgres.js or Drizzle from packages/db. Writes audit_log row with action='identity.two_factor_reset_manual', actorSubject='founder:manual:<email>', targetType='user', targetId=<user-id>, payload={reason:'lost-device-recovery', resetAt:<ISO>}.

    Step I — Create infra/runbooks/spf-dkim-dmarc-checklist.md (D-07). Document the 4 DNS records per interfaces block. Include `dig TXT resto.app` and `dig TXT resend._domainkey.resto.app` verification commands. Include https://mail-tester.com end-to-end verification step. Document this MUST happen BEFORE the first Phase 3 staging deploy (per D-07 + RESEARCH.md Pitfall warning about Gmail silently `dmarc=fail`-ing operator invitations).

  </action>
  <verify>
    <automated>pnpm --filter @resto/api test:e2e gdpr-retention</automated>
    <automated>pnpm --filter @resto/api test:e2e per-tenant-signin-rate-limit</automated>
    <automated>pnpm exec nx test events --testPathPattern=withoutTenant-allowlist</automated>
    <automated>pnpm exec nx run-many --target=preflight</automated>
    <automated>test -f infra/runbooks/2fa-recovery.md</automated>
    <automated>test -f infra/runbooks/spf-dkim-dmarc-checklist.md</automated>
    <automated>test -f scripts/reset-2fa.ts</automated>
    <automated>pnpm exec tsx scripts/reset-2fa.ts --dry-run --user-id 00000000-0000-0000-0000-000000000000 || echo "CLI prints help on missing user; manual verification needed in code review"</automated>
  </verify>
  <done>
    GDPR sweep ships as new sibling NestJS @Cron scheduler services under BackgroundJobsModule mirroring tenant-erasure-scheduler shape; sweep extends invitation + verification per D-21 with the right WHERE clauses; new scheduler file paths registered in TEN-11 allowlist + matching ESLint overrides + parity test green + preflight green; per-tenant signin rate-limit middleware wired with timing-parity 429 branch; e2e specs cover all 5 new behaviors; runbooks landed for 2FA recovery + DNS checklist; scripts/reset-2fa.ts dry-run works.
  </done>
</task>

</tasks>

<threat_model>

## Trust Boundaries

| Boundary                                                     | Description                                                                                                                                                   |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BA boot → in-memory accessControl map                        | Drift between code-side SYSTEM_ROLES and the map fed to BA at init could silently grant/deny permissions; assertSystemRolesPresent at boot catches this       |
| BA hook execution context (no ALS) → audit envelope emission | D-17 explicit: db.withTenantId binding required (BA fires outside HTTP middleware ALS frame); ADR-0020 I-6 forbids runInTenantContext outside HTTP middleware |
| Role-mutation actor → BA endpoint → hook → audit             | Audit row attribution depends on actorUserId being captured; best-effort + immutable audit even when null                                                     |
| GDPR retention cron → invitation+verification tables         | Bypass-tenant operation under explicit reason string; TEN-11 allowlist enforced                                                                               |
| Founder-side 2FA reset (CLI) → user state                    | Manual identity-verification gate; documented runbook; auditable via audit_log row                                                                            |

## STRIDE Threat Register

| Threat ID | Category               | Component                                                                          | Disposition | Mitigation Plan                                                                                                                                                                                                                      |
| --------- | ---------------------- | ---------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| T-03-36   | Repudiation            | Role mutation without audit (the Phase 1 BLOCKED row)                              | mitigate    | organizationHooks.afterUpdateMemberRole wired; identity.role_changed.v1 envelope emitted via buildEnvelope + appendToOutbox; audit_log row materializes through existing pipeline (verified in audit-gap.md WIRED rows pipeline 1-5) |
| T-03-37   | Elevation of Privilege | Admin promotes self to owner via direct BA call                                    | mitigate    | BA's creatorRole enforcement applies to ALL role-mutation paths including auth.api.updateMemberRole (Pitfall 5 + verified at crud-invites.mjs:112 — same authorization layer); Phase 17 / TEAM-03 e2e pins this for the UI path      |
| T-03-38   | Tampering              | Stash leaked across requests (memory pollution via property assignment)            | mitigate    | AUTH-11 WeakMap refactor — keyed on ctx.context object; GC drops entries when context dropped; no enumerable property pollution; existing identity-audit.e2e.spec.ts regression preserved                                            |
| T-03-39   | Information Disclosure | Verification rows leak past TTL with PII                                           | mitigate    | D-21 daily sweep deletes verification rows past expiry + 1h buffer; Pitfall 6 closed                                                                                                                                                 |
| T-03-40   | Information Disclosure | Invitation rows leak past TTL with PII                                             | mitigate    | D-21 daily sweep deletes invitation rows past expires_at + 30d AND status NOT pending (preserves pending visibility per Skeptic MED-9)                                                                                               |
| T-03-41   | Denial of Service      | Credential-stuffing attack per-tenant                                              | mitigate    | D-20 per-tenant signin rate-limit; default 60/min generous for onboarding but tight against credential stuffing                                                                                                                      |
| T-03-42   | Information Disclosure | Rate-limit boundary timing divulges per-tenant config                              | mitigate    | D-06 second clause; 429 response from per-tenant bucket time-equalized to match per-IP/per-email 429                                                                                                                                 |
| T-03-43   | Elevation of Privilege | Owner email phished + recovery loop bypass                                         | mitigate    | D-23 — no email-recovery loop ships; manual founder-side reset is documented path; runbook + audit row                                                                                                                               |
| T-03-44   | Spoofing               | Operator invitation email silently dmarc=fail                                      | mitigate    | D-07 pre-deploy DNS checklist; infra/runbooks/spf-dkim-dmarc-checklist.md must execute before first staging Phase 3 deploy                                                                                                           |
| T-03-45   | Repudiation            | Founder 2FA reset not audited                                                      | mitigate    | scripts/reset-2fa.ts writes audit_log row with action='identity.two_factor_reset_manual', actorSubject='founder:manual:<email>' — forensic trail intact                                                                              |
| T-03-46   | Tampering              | Permission drift between code SYSTEM_ROLES and BA-registered presets               | mitigate    | assertSystemRolesPresent at boot throws SystemRoleDriftError on mismatch; admin-denied-permissions regression test pins ineligible perms; deep-equality covers re-ordering / silent additions                                        |
| T-03-47   | Tampering              | New GDPR scheduler db.withoutTenant call site ships without allowlist registration | mitigate    | Task 3 Step C registers the new scheduler file paths in TEN-11 allowlist + ESLint overrides; parity test + preflight gate any drift                                                                                                  |

</threat_model>

<verification>
- pnpm --filter @resto/events test contracts/identity
- pnpm exec vitest run test/unit/system-roles-presets.spec.ts
- pnpm --filter @resto/api test identity-boot-system-roles
- pnpm --filter @resto/api test:e2e identity-role-changed
- pnpm --filter @resto/api test:e2e identity-audit (regression net for WeakMap refactor)
- pnpm --filter @resto/api test:e2e gdpr-retention
- pnpm --filter @resto/api test:e2e per-tenant-signin-rate-limit
- pnpm exec nx test events --testPathPattern=withoutTenant-allowlist
- pnpm exec nx run-many --target=preflight
- grep -c "as unknown as.*__resto" apps/api/src/contexts/identity/infrastructure/better-auth/auth.config.ts returns 0
- grep -c "afterUpdateMemberRole" apps/api/src/contexts/identity/infrastructure/better-auth/auth.config.ts returns at least 1
- grep -c "identity.role_changed" apps/api/src/contexts/audit/application/record-audit.service.ts returns at least 1
- grep -v '^#' .planning/phases/01-tenancy-hardening/audit-gap.md | grep -c "BLOCKED" returns 0 (or only in archived context, not active rows)
- grep -c "WIRED.*afterUpdateMemberRole" .planning/phases/01-tenancy-hardening/audit-gap.md returns at least 1
- test -f apps/api/src/bootstrap/assert-system-roles-present.ts
- test -f infra/runbooks/2fa-recovery.md
- test -f infra/runbooks/spf-dkim-dmarc-checklist.md
- test -f scripts/reset-2fa.ts
</verification>

<success_criteria>

- AUTH-09 ROADMAP Success Criterion 5 satisfied as REINTERPRETED per plan-checker B-4 2026-05-30: Static system role presets (owner/admin/staff) confirmed at BA init via in-code accessControl wiring (access-control.ts:6-9 → auth.config.ts:148-153); boot-time `assertSystemRolesPresent(auth)` drift guard throws SystemRoleDriftError if the BA map drifts from SYSTEM_ROLES; organizationHooks.afterUpdateMemberRole wired in auth.config.ts to emit identity.role_changed.v1 envelope through outbox on every BA-driven role mutation; audit projection map covers the new event type; BLOCKED row in audit-gap.md updated to WIRED with reference to the live hook. NO `organization_role` DB migration shipped — the table remains BA's dynamic tenant-creatable storage.
- AUTH-11 satisfied: BA context-stash **restoSignOut + **restoPasswordReset replaced with WeakMap<object, Stash> (no `as unknown as` cast); regression e2e for sign-out + password-reset still green
- D-21 satisfied: daily GDPR sweep on invitation + verification tables shipped as new sibling NestJS @Cron scheduler services under BackgroundJobsModule; reason strings allowlisted under TEN-11
- D-20 satisfied: per-tenant signin rate-limit wired with D-06 timing parity at 429 boundary
- D-23 + D-07 non-code deliverables shipped: 2FA recovery runbook + scripts/reset-2fa.ts CLI + SPF/DKIM/DMARC pre-deploy checklist
- Phase 3 closed — all 11 AUTH-\* requirements complete; audit-gap.md no longer has any BLOCKED rows for identity context
  </success_criteria>

<output>
Create `.planning/phases/03-auth-completion/03-05-SUMMARY.md` when done — include:
- The confirmation finding from Task 1 Step G (BA organization.create default owner-assignment behavior).
- The exact line number of organizationHooks.afterUpdateMemberRole in the final auth.config.ts (for the audit-gap.md WIRED reference).
- The chosen GDPR scheduler shape (two sibling files vs one consolidated auth-token-retention-scheduler.service.ts) and the rationale.
- The line numbers where new file paths were added to packages/db/src/withoutTenant.allowlist.ts and apps/api/eslint.config.mjs for future audit grepping.
</output>
