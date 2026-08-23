import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { schema, TenantAwareDb } from '@resto/db';
import {
  isDockerAvailable,
  startRealStack,
  stopRealStack,
  type RealStack,
} from './with-real-stack.setup';
import { provisionTenant, runBootstrap, signInAsOperator } from './helpers/operator-fixture';
import { AUTH_DRIZZLE_TOKEN } from '../../src/contexts/identity/identity.tokens';
import type { AuthDrizzle } from '../../src/contexts/identity/infrastructure/better-auth/auth-db';

/**
 * AUTH-09 / D-16a (Phase 3 / Plan 05 / Micro-task A): regression net for
 * the `organizationHooks.afterUpdateMemberRole` wiring in `auth.config.ts`.
 *
 * BA's `/api/auth/organization/update-member-role` route invokes the hook
 * on every successful role mutation; the hook calls `opts.emitter.emit(
 * buildEnvelope(IdentityRoleChangedV1, …))` inline →
 * `IdentityEventEmitterAdapter` → `db.withTenantId` → `appendToOutbox` →
 * OutboxDispatcher → NATS → NatsAuditSubscriber → `audit_log` row.
 *
 * This spec closes the role-change BLOCKED row in
 * `.planning/phases/01-tenancy-hardening/audit-gap.md`.
 *
 * Docker-gated per the e2e convention (`isDockerAvailable()`): skips
 * silently when Docker is unavailable so CI parity is preserved with the
 * rest of the e2e suite.
 */

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;

if (!dockerOk) {
  console.warn('[identity-role-changed.e2e] Docker not available — skipping integration tests.');
}

const INTERNAL_TOKEN = 'integration-test-token-1234567890';

suite('Identity role-change audit pipeline — BA hook → outbox → NATS → audit_log (D-16a)', () => {
  let stack: RealStack;

  beforeAll(async () => {
    process.env.RATE_LIMIT_AUTH_SIGNIN_PER_MIN = '1000';
    process.env.RATE_LIMIT_AUTH_SIGNIN_PER_EMAIL_PER_MIN = '1000';
    process.env.RATE_LIMIT_INTERNAL_PER_MIN = '10000';
    // Verification OFF — runBootstrap-created accounts would otherwise be
    // blocked at sign-in.
    process.env.REQUIRE_EMAIL_VERIFICATION = 'false';
    stack = await startRealStack();
  }, 180_000);

  afterAll(async () => {
    await stopRealStack(stack);
  });

  it('records identity.role_changed.v1 in audit_log when an owner promotes a staff member to admin', async () => {
    const slug = `rolechg-${randomUUID().slice(0, 8)}`;
    const ownerPassword = 'correct-horse-battery-staple-owner-rolechg';
    const ownerEmail = `owner-${slug}@example.com`;
    const memberPassword = 'correct-horse-battery-staple-member-rolechg';
    // The staff member needs a real BA user account. `runBootstrap`
    // provisions a NEW tenant under that user's ownership — that's fine;
    // we only need the userId. The staff-on-OUR-tenant relationship is
    // established by a direct `member` insert below (BA's accept-invitation
    // flow is exercised by identity-invitation.e2e.spec.ts and would
    // needlessly couple specs).
    const memberSlug = `rolechg-member-${randomUUID().slice(0, 8)}`;
    const memberEmail = `member-${slug}@example.com`;

    const tenant = await provisionTenant(stack.app, slug, INTERNAL_TOKEN);
    const owner = await runBootstrap({
      tenantSlug: slug,
      email: ownerEmail,
      password: ownerPassword,
      name: 'Role-Change Owner',
    });
    // Second tenant exists only to mint the staff user; the user gets
    // attached to OUR tenant via a direct `member` row insert below.
    await provisionTenant(stack.app, memberSlug, INTERNAL_TOKEN);
    const staffUser = await runBootstrap({
      tenantSlug: memberSlug,
      email: memberEmail,
      password: memberPassword,
      name: 'Role-Change Staff',
    });

    const ownerCookie = await signInAsOperator(stack.app, ownerEmail, ownerPassword, tenant.id);

    // Direct DB insert: attach the staff user to the OWNER's tenant.
    // BA's `member` row PK is `text`; any unique string is valid.
    const authDb = stack.app.get<AuthDrizzle>(AUTH_DRIZZLE_TOKEN);
    const memberRowId = randomUUID();
    await authDb.db.insert(schema.member).values({
      id: memberRowId,
      tenantId: tenant.id,
      userId: staffUser.userId,
      role: 'staff',
      createdAt: new Date(),
    });

    // Trigger the role mutation via BA's HTTP endpoint. This invokes
    // `organizationHooks.afterUpdateMemberRole` server-side.
    const promoteRes = await stack.app.inject({
      method: 'POST',
      url: '/api/auth/organization/update-member-role',
      headers: { 'content-type': 'application/json', cookie: ownerCookie },
      payload: {
        memberId: memberRowId,
        role: 'admin',
        organizationId: tenant.id,
      },
    });
    expect([200, 201]).toContain(promoteRes.statusCode);

    const db = stack.app.get(TenantAwareDb);

    // 1) Outbox proves the hook fired and the envelope landed.
    const outboxDeadline = Date.now() + 10_000;
    let outboxRows: { type: string; tenantId: string | null; payload: unknown }[] = [];
    while (Date.now() < outboxDeadline) {
      outboxRows = await db.withoutTenant('identity-role-changed e2e: poll outbox', (tx) =>
        tx
          .select({
            type: schema.outboxEvents.type,
            tenantId: schema.outboxEvents.tenantId,
            payload: schema.outboxEvents.payload,
          })
          .from(schema.outboxEvents)
          .where(eq(schema.outboxEvents.type, 'identity.role_changed.v1')),
      );
      if (outboxRows.some((r) => r.tenantId === tenant.id)) break;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    const myOutboxRow = outboxRows.find((r) => r.tenantId === tenant.id);
    expect(myOutboxRow).toBeDefined();
    const payload = myOutboxRow?.payload as {
      userId: string;
      tenantId: string;
      previousRole: string;
      newRole: string;
    };
    expect(payload.userId).toBe(staffUser.userId);
    expect(payload.tenantId).toBe(tenant.id);
    expect(payload.previousRole).toBe('staff');
    expect(payload.newRole).toBe('admin');

    // 2) Audit row proves the full pipeline (outbox → NATS → subscriber → projection).
    const auditDeadline = Date.now() + 20_000;
    let auditRows: {
      action: string;
      tenantId: string | null;
      actorSubject: string;
      targetType: string | null;
      targetId: string | null;
    }[] = [];
    while (Date.now() < auditDeadline) {
      auditRows = await db.withoutTenant('identity-role-changed e2e: poll audit_log', (tx) =>
        tx
          .select({
            action: schema.auditLog.action,
            tenantId: schema.auditLog.tenantId,
            actorSubject: schema.auditLog.actorSubject,
            targetType: schema.auditLog.targetType,
            targetId: schema.auditLog.targetId,
          })
          .from(schema.auditLog)
          .where(eq(schema.auditLog.action, 'identity.role_changed.v1')),
      );
      if (auditRows.some((r) => r.tenantId === tenant.id)) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    const myAuditRow = auditRows.find((r) => r.tenantId === tenant.id);
    expect(myAuditRow).toBeDefined();
    expect(myAuditRow?.action).toBe('identity.role_changed.v1');
    expect(myAuditRow?.targetType).toBe('user');
    expect(myAuditRow?.targetId).toBe(staffUser.userId);
    // `actorSubject` falls back to `userId` (the changed member) when BA
    // does not surface the calling user on the hook payload — see
    // IdentityRoleChangedV1Payload doc comment + audit projection map.
    expect(myAuditRow?.actorSubject).toBe(staffUser.userId);

    // Silence unused-binding warnings for the bootstrapped owner — a future
    // enhancement would capture the BA calling user as `actorUserId` (best-
    // effort / optional per the contract).
    expect(owner.userId).toBeTruthy();
  }, 60_000);
});
