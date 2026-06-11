import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import { schema, WITHOUT_TENANT_ALLOWLIST } from '@resto/db';
import {
  isDockerAvailable,
  startRealStack,
  stopRealStack,
  type RealStack,
} from './with-real-stack.setup';
import { provisionTenant } from './helpers/operator-fixture';
import { InvitationRetentionSchedulerService } from '../../src/infrastructure/jobs/invitation-retention-scheduler.service';
import { VerificationRetentionSchedulerService } from '../../src/infrastructure/jobs/verification-retention-scheduler.service';
import { AUTH_DRIZZLE_TOKEN } from '../../src/contexts/identity/identity.tokens';
import type { AuthDrizzle } from '../../src/contexts/identity/infrastructure/better-auth/auth-db';

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;

const INTERNAL_TOKEN = 'integration-test-token-1234567890';

suite('GDPR retention sweep — invitation + verification (D-21)', () => {
  let stack: RealStack;
  let authDb: AuthDrizzle;
  let invitationScheduler: InvitationRetentionSchedulerService;
  let verificationScheduler: VerificationRetentionSchedulerService;
  let tenantId: string;

  beforeAll(async () => {
    stack = await startRealStack();
    // BA-owned auth tables (user/invitation/verification) are reachable only
    // under resto_auth — resto_app's privileges on them are revoked. Seed and
    // assert through the same role the schedulers sweep with.
    authDb = stack.app.get<AuthDrizzle>(AUTH_DRIZZLE_TOKEN);
    invitationScheduler = stack.app.get(InvitationRetentionSchedulerService);
    verificationScheduler = stack.app.get(VerificationRetentionSchedulerService);

    const slug = `gdpr-${randomUUID().slice(0, 8)}`;
    const tenant = await provisionTenant(stack.app, slug, INTERNAL_TOKEN);
    tenantId = tenant.id;
  }, 180_000);

  afterAll(async () => {
    await stopRealStack(stack);
  });

  it('Test 1: deletes expired/revoked/accepted invitation rows older than 30 days; preserves pending', async () => {
    const past31d = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const inviterId = `user-${randomUUID().slice(0, 8)}`;
    await authDb.db.execute(
      sql`INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
          VALUES (${inviterId}, 'Test Inviter', ${`inviter-${randomUUID()}@example.com`}, true, now(), now())`,
    );

    const oldExpired = randomUUID();
    const oldRevoked = randomUUID();
    const oldAccepted = randomUUID();
    const oldPending = randomUUID();
    const newExpired = randomUUID();

    for (const [id, status, expiresAt] of [
      [oldExpired, 'expired', past31d],
      [oldRevoked, 'revoked', past31d],
      [oldAccepted, 'accepted', past31d],
      [oldPending, 'pending', past31d],
      [newExpired, 'expired', future],
    ] as const) {
      await authDb.db.insert(schema.invitation).values({
        id,
        organizationId: tenantId,
        email: `${id}@example.com`,
        role: 'staff',
        status,
        expiresAt,
        inviterId,
      });
    }

    await invitationScheduler.run();

    const remaining = await authDb.db
      .select({ id: schema.invitation.id })
      .from(schema.invitation)
      .where(and(eq(schema.invitation.organizationId, tenantId)));

    const remainingIds = remaining.map((r) => r.id);

    expect(remainingIds).not.toContain(oldExpired);
    expect(remainingIds).not.toContain(oldRevoked);
    expect(remainingIds).not.toContain(oldAccepted);
    expect(remainingIds).toContain(oldPending);
    expect(remainingIds).toContain(newExpired);
  });

  it('Test 2: deletes verification rows with expiresAt older than 1 hour', async () => {
    const past2h = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const future30min = new Date(Date.now() + 30 * 60 * 1000);

    const staleId = randomUUID();
    const freshId = randomUUID();

    await authDb.db.insert(schema.verification).values([
      {
        id: staleId,
        identifier: `reset-password:stale-${staleId}`,
        value: randomUUID(),
        expiresAt: past2h,
      },
      {
        id: freshId,
        identifier: `reset-password:fresh-${freshId}`,
        value: randomUUID(),
        expiresAt: future30min,
      },
    ]);

    await verificationScheduler.run();

    const remaining = await authDb.db
      .select({ id: schema.verification.id })
      .from(schema.verification)
      .where(eq(schema.verification.id, staleId));

    expect(remaining).toHaveLength(0);

    const fresh = await authDb.db
      .select({ id: schema.verification.id })
      .from(schema.verification)
      .where(eq(schema.verification.id, freshId));
    expect(fresh).toHaveLength(1);
  });

  it('Test 3: retention schedulers sweep via resto_auth — NOT on the withoutTenant allowlist', () => {
    // The invitation + verification sweeps delete from BA-owned auth tables via
    // AuthDrizzle (resto_auth, which owns them), not resto_app's db.withoutTenant.
    // They must therefore NOT appear in WITHOUT_TENANT_ALLOWLIST.
    expect(WITHOUT_TENANT_ALLOWLIST).not.toContain(
      'apps/api/src/infrastructure/jobs/invitation-retention-scheduler.service.ts',
    );
    expect(WITHOUT_TENANT_ALLOWLIST).not.toContain(
      'apps/api/src/infrastructure/jobs/verification-retention-scheduler.service.ts',
    );
  });
});
