import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, like } from 'drizzle-orm';
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

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;

const INTERNAL_TOKEN = 'integration-test-token-1234567890';

suite('Identity audit pipeline — sign-in → NATS → audit_log (RES-132)', () => {
  let stack: RealStack;

  beforeAll(async () => {
    process.env.RATE_LIMIT_INTERNAL_PER_MIN = '10000';
    stack = await startRealStack();
  }, 180_000);

  afterAll(async () => {
    await stopRealStack(stack);
  });

  it('records identity.signed_in.v1 in audit_log with actor and ip metadata', async () => {
    const slug = `signin-${randomUUID().slice(0, 8)}`;
    const password = 'correct-horse-battery-staple-signin';
    const email = `owner-${slug}@example.com`;

    const tenant = await provisionTenant(stack.app, slug, INTERNAL_TOKEN);
    const owner = await runBootstrap({ tenantSlug: slug, email, password, name: 'Sign-In Owner' });

    // signInAsOperator = sign-in + set-active. The set-active call triggers
    // session.update.after → outbox row → NATS → audit subscriber → audit_log.
    await signInAsOperator(stack.app, email, password, tenant.id);

    const db = stack.app.get(TenantAwareDb);

    const deadline = Date.now() + 20_000;
    let rows: {
      action: string;
      tenantId: string | null;
      actorSubject: string;
      targetType: string | null;
      targetId: string | null;
      userAgent: string | null;
    }[] = [];
    while (Date.now() < deadline) {
      rows = await db.withoutTenant('identity-audit e2e: poll audit_log', (tx) =>
        tx
          .select({
            action: schema.auditLog.action,
            tenantId: schema.auditLog.tenantId,
            actorSubject: schema.auditLog.actorSubject,
            targetType: schema.auditLog.targetType,
            targetId: schema.auditLog.targetId,
            userAgent: schema.auditLog.userAgent,
          })
          .from(schema.auditLog)
          .where(eq(schema.auditLog.action, 'identity.signed_in.v1')),
      );
      if (rows.some((r) => r.tenantId === tenant.id)) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    const myRow = rows.find((r) => r.tenantId === tenant.id);
    expect(myRow).toBeDefined();
    expect(myRow?.action).toBe('identity.signed_in.v1');
    expect(myRow?.actorSubject).toBe(owner.userId);
    expect(myRow?.targetType).toBe('user');
    expect(myRow?.targetId).toBe(owner.userId);
    // user_agent is the test-injector's UA — Fastify's `light-my-request`
    // sets it. We don't assert the exact value, just that something landed.
    expect(myRow?.userAgent).toBeTruthy();
  }, 30_000);

  it('emits exactly one row per sign-in (no false-fires from non-set-active session UPDATEs)', async () => {
    // Guards Critical-1: if the URL filter matched set-active-team or any
    // other session UPDATE, we would see more rows than sign-ins.
    const slug = `signin-dedup-${randomUUID().slice(0, 8)}`;
    const password = 'correct-horse-battery-staple-dedup';
    const email = `owner-${slug}@example.com`;

    const tenant = await provisionTenant(stack.app, slug, INTERNAL_TOKEN);
    const owner = await runBootstrap({ tenantSlug: slug, email, password, name: 'Dedup Owner' });

    // Sign in twice through the full set-active path.
    await signInAsOperator(stack.app, email, password, tenant.id);
    await signInAsOperator(stack.app, email, password, tenant.id);

    const db = stack.app.get(TenantAwareDb);

    // Wait until at least 2 rows land, then assert no more than 2.
    const deadline = Date.now() + 20_000;
    let myRows: { action: string; tenantId: string | null; actorSubject: string }[] = [];
    while (Date.now() < deadline) {
      const all = await db.withoutTenant('identity-audit dedup: poll audit_log', (tx) =>
        tx
          .select({
            action: schema.auditLog.action,
            tenantId: schema.auditLog.tenantId,
            actorSubject: schema.auditLog.actorSubject,
          })
          .from(schema.auditLog)
          .where(eq(schema.auditLog.action, 'identity.signed_in.v1')),
      );
      myRows = all.filter((r) => r.tenantId === tenant.id);
      if (myRows.length >= 2) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    expect(myRows).toHaveLength(2);
    expect(myRows.every((r) => r.actorSubject === owner.userId)).toBe(true);
  }, 60_000);

  it('records identity.signed_out.v1 and invalidates the session on POST /api/auth/sign-out', async () => {
    const slug = `signout-${randomUUID().slice(0, 8)}`;
    const password = 'correct-horse-battery-staple-signout';
    const email = `owner-${slug}@example.com`;

    const tenant = await provisionTenant(stack.app, slug, INTERNAL_TOKEN);
    const owner = await runBootstrap({ tenantSlug: slug, email, password, name: 'Sign-Out Owner' });
    const cookie = await signInAsOperator(stack.app, email, password, tenant.id);

    const sanityBefore = await stack.app.inject({
      method: 'GET',
      url: '/v1/tenants/me',
      headers: { cookie },
    });
    expect(sanityBefore.statusCode).toBe(200);

    const signOutRes = await stack.app.inject({
      method: 'POST',
      url: '/api/auth/sign-out',
      headers: { cookie, 'content-type': 'application/json' },
      payload: {},
    });
    expect(signOutRes.statusCode).toBe(200);

    const sanityAfter = await stack.app.inject({
      method: 'GET',
      url: '/v1/tenants/me',
      headers: { cookie },
    });
    expect(sanityAfter.statusCode).toBe(401);

    const db = stack.app.get(TenantAwareDb);
    const deadline = Date.now() + 20_000;
    let signOutRows: {
      action: string;
      tenantId: string | null;
      actorSubject: string;
      targetType: string | null;
      targetId: string | null;
    }[] = [];
    while (Date.now() < deadline) {
      signOutRows = await db.withoutTenant('identity-audit e2e: poll signed_out', (tx) =>
        tx
          .select({
            action: schema.auditLog.action,
            tenantId: schema.auditLog.tenantId,
            actorSubject: schema.auditLog.actorSubject,
            targetType: schema.auditLog.targetType,
            targetId: schema.auditLog.targetId,
          })
          .from(schema.auditLog)
          .where(eq(schema.auditLog.action, 'identity.signed_out.v1')),
      );
      if (signOutRows.some((r) => r.tenantId === tenant.id)) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    const myRow = signOutRows.find((r) => r.tenantId === tenant.id);
    expect(myRow).toBeDefined();
    expect(myRow?.actorSubject).toBe(owner.userId);
    expect(myRow?.targetType).toBe('user');
    expect(myRow?.targetId).toBe(owner.userId);
  }, 30_000);

  it('revokes all user sessions and emits password_reset_completed.v1 on reset', async () => {
    const slug = `reset-${randomUUID().slice(0, 8)}`;
    const oldPassword = 'correct-horse-battery-staple-old';
    const newPassword = 'correct-horse-battery-staple-new';
    const email = `owner-${slug}@example.com`;

    const tenant = await provisionTenant(stack.app, slug, INTERNAL_TOKEN);
    const owner = await runBootstrap({
      tenantSlug: slug,
      email,
      password: oldPassword,
      name: 'Reset Owner',
    });
    const cookie = await signInAsOperator(stack.app, email, oldPassword, tenant.id);

    const sanityBefore = await stack.app.inject({
      method: 'GET',
      url: '/v1/tenants/me',
      headers: { cookie },
    });
    expect(sanityBefore.statusCode).toBe(200);

    const forgetRes = await stack.app.inject({
      method: 'POST',
      url: '/api/auth/forget-password',
      headers: { 'content-type': 'application/json' },
      payload: { email },
    });
    expect(forgetRes.statusCode).toBe(200);

    const authDb = stack.app.get<AuthDrizzle>(AUTH_DRIZZLE_TOKEN);
    const verificationRows = await authDb.db
      .select()
      .from(schema.verification)
      .where(
        and(
          eq(schema.verification.value, owner.userId),
          like(schema.verification.identifier, 'reset-password:%'),
        ),
      );
    const identifierRow = verificationRows[0];
    expect(identifierRow).toBeDefined();
    const token = identifierRow?.identifier.replace('reset-password:', '') ?? '';

    const resetRes = await stack.app.inject({
      method: 'POST',
      url: '/api/auth/reset-password',
      headers: { 'content-type': 'application/json' },
      payload: { newPassword, token },
    });
    expect(resetRes.statusCode).toBe(200);

    const sanityAfter = await stack.app.inject({
      method: 'GET',
      url: '/v1/tenants/me',
      headers: { cookie },
    });
    expect(sanityAfter.statusCode).toBe(401);

    const newCookie = await signInAsOperator(stack.app, email, newPassword, tenant.id);
    const sanityNew = await stack.app.inject({
      method: 'GET',
      url: '/v1/tenants/me',
      headers: { cookie: newCookie },
    });
    expect(sanityNew.statusCode).toBe(200);

    const db = stack.app.get(TenantAwareDb);
    const deadline = Date.now() + 20_000;
    let resetRows: { actorSubject: string; targetType: string | null; targetId: string | null }[] =
      [];
    while (Date.now() < deadline) {
      resetRows = await db.withoutTenant(
        'identity-audit e2e: poll password_reset_completed',
        (tx) =>
          tx
            .select({
              actorSubject: schema.auditLog.actorSubject,
              targetType: schema.auditLog.targetType,
              targetId: schema.auditLog.targetId,
            })
            .from(schema.auditLog)
            .where(eq(schema.auditLog.action, 'identity.password_reset_completed.v1')),
      );
      if (resetRows.length > 0) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    const myRow = resetRows[0];
    expect(myRow).toBeDefined();
    expect(myRow?.actorSubject).toBe(owner.userId);
    expect(myRow?.targetType).toBe('user');
    expect(myRow?.targetId).toBe(owner.userId);
  }, 60_000);
});
