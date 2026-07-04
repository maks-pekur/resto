import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { schema } from '@resto/db';
import {
  isDockerAvailable,
  startRealStack,
  stopRealStack,
  type RealStack,
} from './with-real-stack.setup';
import { provisionTenant, runBootstrap, signInAsOperator } from './helpers/operator-fixture';
import { AUTH_DRIZZLE_TOKEN } from '../../src/contexts/identity/identity.tokens';
import type { AuthDrizzle } from '../../src/contexts/identity/infrastructure/better-auth/auth-db';

const INTERNAL_TOKEN = 'integration-test-token-1234567890';
const PASSWORD = 'Sup3r-Secret-Pw-Escalation!';

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;

if (!dockerOk) {
  console.warn(
    '[roles-privilege-escalation.e2e] Docker not available — skipping integration tests.',
  );
}

suite(
  'Privilege-escalation proof — create-side (admin 403, owner NON_DELEGATABLE 403) + assign-side gate (D-06, D-04, SC#3)',
  () => {
    let stack: RealStack;
    let ownerCookie: string;
    let adminCookie: string;
    let tenantId: string;
    let floorManagerSlug: string;

    beforeAll(async () => {
      process.env.RATE_LIMIT_AUTH_SIGNIN_PER_MIN = '1000';
      process.env.RATE_LIMIT_AUTH_SIGNIN_PER_EMAIL_PER_MIN = '1000';
      process.env.RATE_LIMIT_INTERNAL_PER_MIN = '10000';
      process.env.REQUIRE_EMAIL_VERIFICATION = 'false';
      stack = await startRealStack();

      const slug = `esc-${randomUUID().slice(0, 8)}`;
      const ownerEmail = `owner-esc-${randomUUID().slice(0, 8)}@example.com`;

      const tenant = await provisionTenant(stack.app, slug, INTERNAL_TOKEN);
      tenantId = tenant.id;

      await runBootstrap({
        tenantSlug: slug,
        email: ownerEmail,
        password: PASSWORD,
        name: 'Escalation Owner',
      });
      ownerCookie = await signInAsOperator(stack.app, ownerEmail, PASSWORD, tenantId);

      const adminEmail = `admin-esc-${randomUUID().slice(0, 8)}@example.com`;
      const throwawaySlug = `esc-mt-${randomUUID().slice(0, 8)}`;
      await provisionTenant(stack.app, throwawaySlug, INTERNAL_TOKEN);
      const { userId: adminUserId } = await runBootstrap({
        tenantSlug: throwawaySlug,
        email: adminEmail,
        password: PASSWORD,
        name: 'Escalation Admin',
      });
      const authDb = stack.app.get<AuthDrizzle>(AUTH_DRIZZLE_TOKEN);
      await authDb.db.insert(schema.member).values({
        id: randomUUID(),
        organizationId: tenantId,
        userId: adminUserId,
        role: 'admin',
        createdAt: new Date(),
      });
      adminCookie = await signInAsOperator(stack.app, adminEmail, PASSWORD, tenantId);
    }, 180_000);

    afterAll(async () => {
      if (stack) await stopRealStack(stack);
    });

    it('(a) admin-tier POST /v1/roles → 403 (owner-only @Permissions({ac:[create]}))', async () => {
      const res = await stack.app.inject({
        method: 'POST',
        url: '/v1/roles',
        headers: {
          'content-type': 'application/json',
          cookie: adminCookie,
          'x-tenant-id': tenantId,
        },
        payload: { roleName: 'shift-lead', permission: { menu: ['read', 'update'] } },
      });
      expect(res.statusCode).toBe(403);
    });

    it('(b1) owner POST /v1/roles with billing:update → 403 (NON_DELEGATABLE, D-04 holds for owner)', async () => {
      const res = await stack.app.inject({
        method: 'POST',
        url: '/v1/roles',
        headers: {
          'content-type': 'application/json',
          cookie: ownerCookie,
          'x-tenant-id': tenantId,
        },
        payload: { roleName: 'shadow-billing', permission: { billing: ['update'] } },
      });
      expect(res.statusCode).toBe(403);
    });

    it('(b2) owner POST /v1/roles with ac:create → 403 (NON_DELEGATABLE)', async () => {
      const res = await stack.app.inject({
        method: 'POST',
        url: '/v1/roles',
        headers: {
          'content-type': 'application/json',
          cookie: ownerCookie,
          'x-tenant-id': tenantId,
        },
        payload: { roleName: 'shadow-ac', permission: { ac: ['create'] } },
      });
      expect(res.statusCode).toBe(403);
    });

    it('(b3) owner POST /v1/roles with tenant:delete → 403 (NON_DELEGATABLE)', async () => {
      const res = await stack.app.inject({
        method: 'POST',
        url: '/v1/roles',
        headers: {
          'content-type': 'application/json',
          cookie: ownerCookie,
          'x-tenant-id': tenantId,
        },
        payload: { roleName: 'shadow-tenant', permission: { tenant: ['delete'] } },
      });
      expect(res.statusCode).toBe(403);
    });

    it('(c) owner POST /v1/roles with delegatable perms → 201 (control)', async () => {
      const res = await stack.app.inject({
        method: 'POST',
        url: '/v1/roles',
        headers: {
          'content-type': 'application/json',
          cookie: ownerCookie,
          'x-tenant-id': tenantId,
        },
        payload: {
          roleName: 'floor-manager',
          permission: { menu: ['read', 'update'], order: ['read', 'update-status'] },
        },
      });
      expect(res.statusCode).toBe(201);
      const body = res.json<{ roleSlug: string }>();
      floorManagerSlug = body.roleSlug;
      expect(typeof floorManagerSlug).toBe('string');
      expect(floorManagerSlug.length).toBeGreaterThan(0);
    });

    it('(d1) non-owner assign attempt → 403 (wrapper gate: lacks ac:update)', async () => {
      const res = await stack.app.inject({
        method: 'POST',
        url: `/v1/roles/${floorManagerSlug ?? 'floor-manager'}/assign`,
        headers: {
          'content-type': 'application/json',
          cookie: adminCookie,
          'x-tenant-id': tenantId,
        },
        payload: { memberId: randomUUID() },
      });
      expect(res.statusCode).toBe(403);
    });

    it('(d2) owner assigning a system slug via custom-assign endpoint → non-2xx (Pitfall 3)', async () => {
      const res = await stack.app.inject({
        method: 'POST',
        url: '/v1/roles/staff/assign',
        headers: {
          'content-type': 'application/json',
          cookie: ownerCookie,
          'x-tenant-id': tenantId,
        },
        payload: { memberId: randomUUID() },
      });
      expect(res.statusCode).not.toBe(200);
      expect(res.statusCode).not.toBe(201);
    });
  },
);
