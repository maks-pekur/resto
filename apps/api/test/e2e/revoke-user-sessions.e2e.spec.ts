import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { schema } from '@resto/db';
import {
  isDockerAvailable,
  startRealStack,
  stopRealStack,
  type RealStack,
} from './with-real-stack.setup';
import { provisionTenant } from './helpers/operator-fixture';
import { RevokeUserSessionsService } from '../../src/contexts/identity/application/revoke-user-sessions.service';
import { AUTH_DRIZZLE_TOKEN } from '../../src/contexts/identity/identity.tokens';
import type { AuthDrizzle } from '../../src/contexts/identity/infrastructure/better-auth/auth-db';

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;

const INTERNAL_TOKEN = 'integration-test-token-1234567890';

const seedUser = async (authDb: AuthDrizzle): Promise<string> => {
  const userId = `user-${randomUUID().slice(0, 8)}`;
  await authDb.db.insert(schema.user).values({
    id: userId,
    name: 'Multi Org User',
    email: `${userId}@example.com`,
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return userId;
};

const seedMember = async (authDb: AuthDrizzle, userId: string, orgId: string): Promise<void> => {
  await authDb.db.insert(schema.member).values({
    id: `member-${randomUUID().slice(0, 8)}`,
    organizationId: orgId,
    userId,
    role: 'owner',
    createdAt: new Date(),
  });
};

const seedSession = async (
  authDb: AuthDrizzle,
  userId: string,
  activeOrganizationId: string,
): Promise<string> => {
  const id = `session-${randomUUID().slice(0, 8)}`;
  await authDb.db.insert(schema.session).values({
    id,
    userId,
    activeOrganizationId,
    token: randomUUID(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    updatedAt: new Date(),
  });
  return id;
};

const sessionExists = async (authDb: AuthDrizzle, id: string): Promise<boolean> => {
  const rows = await authDb.db
    .select({ id: schema.session.id })
    .from(schema.session)
    .where(eq(schema.session.id, id));
  return rows.length > 0;
};

suite('RevokeUserSessionsService.revokeAllForTenant — org-scoped session revoke (AUDIT #6)', () => {
  let stack: RealStack;
  let authDb: AuthDrizzle;
  let revoker: RevokeUserSessionsService;
  let orgA: string;
  let orgB: string;

  beforeAll(async () => {
    stack = await startRealStack();
    authDb = stack.app.get<AuthDrizzle>(AUTH_DRIZZLE_TOKEN);
    revoker = stack.app.get(RevokeUserSessionsService);

    orgA = (
      await provisionTenant(stack.app, `revoke-a-${randomUUID().slice(0, 8)}`, INTERNAL_TOKEN)
    ).id;
    orgB = (
      await provisionTenant(stack.app, `revoke-b-${randomUUID().slice(0, 8)}`, INTERNAL_TOKEN)
    ).id;
  }, 180_000);

  afterAll(async () => {
    await stopRealStack(stack);
  });

  it('revokes only the sessions active in the archived tenant, leaving the user signed in elsewhere', async () => {
    const userId = await seedUser(authDb);
    await seedMember(authDb, userId, orgA);
    await seedMember(authDb, userId, orgB);
    const sessionInA = await seedSession(authDb, userId, orgA);
    const sessionInB = await seedSession(authDb, userId, orgB);

    const { revokedSessionsCount } = await revoker.revokeAllForTenant(orgA);

    expect(revokedSessionsCount).toBe(1);
    expect(await sessionExists(authDb, sessionInA)).toBe(false);
    expect(await sessionExists(authDb, sessionInB)).toBe(true);
  });
});
