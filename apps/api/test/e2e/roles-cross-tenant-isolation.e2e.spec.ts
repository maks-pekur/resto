import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  isDockerAvailable,
  startRealStack,
  stopRealStack,
  type RealStack,
} from './with-real-stack.setup';
import { provisionTenant, runBootstrap, signInAsOperator } from './helpers/operator-fixture';

const INTERNAL_TOKEN = 'integration-test-token-1234567890';
const PASSWORD = 'Sup3r-Secret-Pw-CrossTenant!';

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;

if (!dockerOk) {
  console.warn(
    '[roles-cross-tenant-isolation.e2e] Docker not available — skipping integration tests.',
  );
}

suite(
  'RBAC-14 / HIGH-7: tenant A cannot read, modify, or delete tenant B custom roles — org-scoped DB filter enforced at service layer',
  () => {
    let stack: RealStack;
    let cookieA: string;
    let cookieB: string;
    let tenantAId: string;
    let tenantBId: string;
    let bRoleSlug: string;

    beforeAll(async () => {
      process.env.RATE_LIMIT_AUTH_SIGNIN_PER_MIN = '1000';
      process.env.RATE_LIMIT_AUTH_SIGNIN_PER_EMAIL_PER_MIN = '1000';
      process.env.RATE_LIMIT_INTERNAL_PER_MIN = '10000';
      process.env.REQUIRE_EMAIL_VERIFICATION = 'false';
      stack = await startRealStack();

      const slugA = `ct-a-${randomUUID().slice(0, 8)}`;
      const slugB = `ct-b-${randomUUID().slice(0, 8)}`;
      const emailA = `owner-a-${randomUUID().slice(0, 8)}@example.com`;
      const emailB = `owner-b-${randomUUID().slice(0, 8)}@example.com`;

      const tenantA = await provisionTenant(stack.app, slugA, INTERNAL_TOKEN);
      tenantAId = tenantA.id;
      await runBootstrap({
        tenantSlug: slugA,
        email: emailA,
        password: PASSWORD,
        name: 'CT Owner A',
      });
      cookieA = await signInAsOperator(stack.app, emailA, PASSWORD, tenantAId);

      const tenantB = await provisionTenant(stack.app, slugB, INTERNAL_TOKEN);
      tenantBId = tenantB.id;
      await runBootstrap({
        tenantSlug: slugB,
        email: emailB,
        password: PASSWORD,
        name: 'CT Owner B',
      });
      cookieB = await signInAsOperator(stack.app, emailB, PASSWORD, tenantBId);

      const roleRes = await stack.app.inject({
        method: 'POST',
        url: '/v1/roles',
        headers: {
          'content-type': 'application/json',
          cookie: cookieB,
          'x-tenant-id': tenantBId,
        },
        payload: { roleName: 'b-only-role', permission: { menu: ['read'] } },
      });
      expect(roleRes.statusCode).toBe(201);
      bRoleSlug = roleRes.json<{ roleSlug: string }>().roleSlug;

      const sanityRes = await stack.app.inject({
        method: 'GET',
        url: '/v1/roles',
        headers: { cookie: cookieB, 'x-tenant-id': tenantBId },
      });
      if (sanityRes.statusCode !== 200) {
        console.error(
          '[debug] GET /v1/roles for ownerB failed:',
          sanityRes.statusCode,
          sanityRes.body,
        );
      }
      expect(sanityRes.statusCode).toBe(200);
      const bRolesBody = sanityRes.json<{ roles: { role: string }[] }>();
      expect(bRolesBody.roles.some((r) => r.role === bRoleSlug)).toBe(true);
    }, 180_000);

    afterAll(async () => {
      if (stack) await stopRealStack(stack);
    });

    it('tenant A GET /v1/roles does not contain tenant B role slug (RBAC-14)', async () => {
      const res = await stack.app.inject({
        method: 'GET',
        url: '/v1/roles',
        headers: { cookie: cookieA, 'x-tenant-id': tenantAId },
      });
      expect(res.statusCode).toBe(200);
      const aRoles = res.json<{ roles: { role: string }[] }>().roles;
      expect(aRoles.every((r) => r.role !== bRoleSlug)).toBe(true);
    });

    it('tenant A PUT /v1/roles/:bRoleSlug → non-2xx (slug not found in tenant A org)', async () => {
      const res = await stack.app.inject({
        method: 'PUT',
        url: `/v1/roles/${bRoleSlug}`,
        headers: {
          'content-type': 'application/json',
          cookie: cookieA,
          'x-tenant-id': tenantAId,
        },
        payload: { permission: { menu: ['read', 'update'] } },
      });
      expect(res.statusCode).not.toBe(200);
      expect(res.statusCode).not.toBe(204);
    });

    it('tenant A DELETE /v1/roles/:bRoleSlug does not archive tenant B role (RBAC-14)', async () => {
      await stack.app.inject({
        method: 'DELETE',
        url: `/v1/roles/${bRoleSlug}`,
        headers: { cookie: cookieA, 'x-tenant-id': tenantAId },
      });
      const bView = await stack.app.inject({
        method: 'GET',
        url: '/v1/roles',
        headers: { cookie: cookieB, 'x-tenant-id': tenantBId },
      });
      expect(bView.statusCode).toBe(200);
      const bRoles = bView.json<{ roles: { role: string }[] }>().roles;
      expect(bRoles.some((r) => r.role === bRoleSlug)).toBe(true);
    });

    it('tenant B GET /v1/roles still returns b-only-role (control — isolation does not break owner access)', async () => {
      const res = await stack.app.inject({
        method: 'GET',
        url: '/v1/roles',
        headers: { cookie: cookieB, 'x-tenant-id': tenantBId },
      });
      expect(res.statusCode).toBe(200);
      const bRoles = res.json<{ roles: { role: string }[] }>().roles;
      expect(bRoles.some((r) => r.role === bRoleSlug)).toBe(true);
    });

    it('GET /v1/roles/members routes to the members handler, not the :roleSlug lookup', async () => {
      const res = await stack.app.inject({
        method: 'GET',
        url: '/v1/roles/members',
        headers: { cookie: cookieB, 'x-tenant-id': tenantBId },
      });
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.json<{ members?: unknown[] }>().members)).toBe(true);
    });
  },
);
