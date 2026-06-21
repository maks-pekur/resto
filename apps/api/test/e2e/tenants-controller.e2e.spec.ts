import 'reflect-metadata';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import postgres from 'postgres';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { drizzle } from 'drizzle-orm/postgres-js';
import { provisionAppRole, provisionAuthRole, runInTenantContext } from '@resto/db';
import { AppModule } from '../../src/app.module';
import { TENANT_REPOSITORY, type TenantRepository } from '../../src/contexts/tenancy/domain/ports';
import {
  addMemberWithRole,
  provisionTenant,
  runBootstrap,
  signInAsOperator,
} from './helpers/operator-fixture';

const MIGRATIONS_DIR = fileURLToPath(
  new URL('../../../../packages/db/migrations', import.meta.url),
);
const APP_PASSWORD = 'app_password_tenants_ctrl_e2e';
const AUTH_PASSWORD = 'auth_password_tenants_ctrl_e2e';
const INTERNAL_TOKEN = 'tenants-ctrl-e2e-internal-token-5678';

describe('TenantsController E2E', () => {
  let container: StartedPostgreSqlContainer;
  let app: NestFastifyApplication;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16').start();
    const adminUrl = container.getConnectionUri();

    const adminClient = postgres(adminUrl);
    await provisionAppRole(adminClient, { appPassword: APP_PASSWORD });
    await provisionAuthRole(adminClient, { authPassword: AUTH_PASSWORD });
    const adminDb = drizzle(adminClient);
    await migrate(adminDb, { migrationsFolder: MIGRATIONS_DIR });
    await adminClient.end();

    const appUrl = new URL(adminUrl);
    appUrl.username = 'resto_app';
    appUrl.password = APP_PASSWORD;

    const authUrl = new URL(adminUrl);
    authUrl.username = 'resto_auth';
    authUrl.password = AUTH_PASSWORD;

    process.env.DATABASE_URL = appUrl.toString();
    process.env.BETTER_AUTH_DATABASE_URL = authUrl.toString();
    process.env.NATS_URL = 'nats://localhost:4222';
    process.env.NODE_ENV = 'test';
    process.env.OTEL_DISABLED = 'true';
    process.env.NATS_DISABLED = 'true';
    process.env.BETTER_AUTH_SECRET = 'tenants-ctrl-e2e-secret-padding-padding-padding';
    process.env.BETTER_AUTH_BASE_URL = 'http://localhost:4000';
    process.env.ADMIN_WEB_URL = 'http://localhost:3000';
    process.env.INTERNAL_API_TOKEN = INTERNAL_TOKEN;
    // AUTH_COOKIE_DOMAIN intentionally unset — host-only cookies in tests.
    // S3_* unblocks AppModule bootstrap; S3SignedImageUrlAdapter throws if
    // any of these three is unset. env.schema only requires them in
    // non-dev/test, but the adapter doesn't honor that gate. The values
    // here are CI-style placeholders; no test in this file calls S3.
    process.env.S3_ENDPOINT = 'http://localhost:9000';
    process.env.S3_ACCESS_KEY = 'x';
    process.env.S3_SECRET_KEY = 'x';

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter({ logger: false }),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  }, 180_000);

  afterAll(async () => {
    await app.close();
    await container.stop();
  });

  // ---------------------------------------------------------------------------
  // GET /v1/tenants/me
  // ---------------------------------------------------------------------------

  describe('GET /v1/tenants/me', () => {
    it('returns 401 without auth', async () => {
      const res = await app.inject({ method: 'GET', url: '/v1/tenants/me' });
      expect(res.statusCode).toBe(401);
    });

    it("returns the operator's tenant when authenticated", async () => {
      const slug = `op-${randomUUID().slice(0, 8)}`;
      const email = `owner-${slug}@example.com`;
      const password = 'correct-horse-battery-staple-tenants-1';

      const tenant = await provisionTenant(app, slug, INTERNAL_TOKEN);
      await runBootstrap({ tenantSlug: slug, email, password, name: 'Tenant Me Owner' });
      const cookie = await signInAsOperator(app, email, password, tenant.id);

      const res = await app.inject({
        method: 'GET',
        url: '/v1/tenants/me',
        headers: { cookie, 'x-tenant-slug': slug },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<{ id: string; slug: string }>();
      expect(body.id).toBe(tenant.id);
      expect(body.slug).toBe(slug);
    });

    it('rejects an operator request that never resolved a tenant context (RES-191)', async () => {
      const slug = `notenant-${randomUUID().slice(0, 8)}`;
      const email = `owner-${slug}@example.com`;
      const password = 'correct-horse-battery-staple-notenant-1';

      const tenant = await provisionTenant(app, slug, INTERNAL_TOKEN);
      await runBootstrap({ tenantSlug: slug, email, password, name: 'No Tenant Owner' });
      const cookie = await signInAsOperator(app, email, password, tenant.id);

      const res = await app.inject({
        method: 'GET',
        url: '/v1/tenants/me',
        headers: { cookie },
      });

      expect(res.statusCode).toBe(403);
      expect(res.headers['content-type']).toContain('application/problem+json');
      const body = res.json<{ type: string; status: number }>();
      expect(body.status).toBe(403);
      expect(body.type).toBe('https://resto.app/problems/auth.tenant_context_missing');
    });

    it('does not let operator A read tenant B (cross-tenant isolation)', async () => {
      // Provision two tenants and bootstrap an owner for each.
      const slugA = `iso-a-${randomUUID().slice(0, 8)}`;
      const slugB = `iso-b-${randomUUID().slice(0, 8)}`;
      const passwordA = 'correct-horse-battery-staple-iso-A';
      const passwordB = 'correct-horse-battery-staple-iso-B';
      const emailA = `owner-${slugA}@example.com`;
      const emailB = `owner-${slugB}@example.com`;

      const tenantA = await provisionTenant(app, slugA, INTERNAL_TOKEN);
      const tenantB = await provisionTenant(app, slugB, INTERNAL_TOKEN);
      await runBootstrap({ tenantSlug: slugA, email: emailA, password: passwordA, name: 'A' });
      await runBootstrap({ tenantSlug: slugB, email: emailB, password: passwordB, name: 'B' });

      // Operator A's session: must always see tenant A's snapshot, never B's.
      const cookieA = await signInAsOperator(app, emailA, passwordA, tenantA.id);
      const seenByA = await app.inject({
        method: 'GET',
        url: '/v1/tenants/me',
        headers: { cookie: cookieA, 'x-tenant-slug': slugA },
      });
      expect(seenByA.statusCode).toBe(200);
      const bodyA = seenByA.json<{ id: string; slug: string }>();
      expect(bodyA.id).toBe(tenantA.id);
      expect(bodyA.slug).toBe(slugA);
      expect(bodyA.id).not.toBe(tenantB.id);
      expect(bodyA.slug).not.toBe(slugB);

      // Operator A trying to switch to tenant B's organization id must fail
      // — they are not a member of B.
      const switchAttempt = await app.inject({
        method: 'POST',
        url: '/api/auth/organization/set-active',
        headers: { 'content-type': 'application/json', cookie: cookieA },
        payload: { organizationId: tenantB.id },
      });
      expect(switchAttempt.statusCode).toBeGreaterThanOrEqual(400);
    });
  });

  describe('AuthGuard cross-tenant principal isolation (RES-126)', () => {
    it('rejects a session bound to tenant A when the request resolves tenant B', async () => {
      const slugA = `xtenant-a-${randomUUID().slice(0, 8)}`;
      const slugB = `xtenant-b-${randomUUID().slice(0, 8)}`;
      const passwordA = 'correct-horse-battery-staple-xtenant-A';
      const emailA = `owner-${slugA}@example.com`;

      const tenantA = await provisionTenant(app, slugA, INTERNAL_TOKEN);
      await provisionTenant(app, slugB, INTERNAL_TOKEN);
      await runBootstrap({
        tenantSlug: slugA,
        email: emailA,
        password: passwordA,
        name: 'Cross-Tenant Owner A',
      });
      const cookieA = await signInAsOperator(app, emailA, passwordA, tenantA.id);

      const res = await app.inject({
        method: 'GET',
        url: '/v1/tenants/me',
        headers: { cookie: cookieA, 'x-tenant-slug': slugB },
      });

      expect(res.statusCode).toBe(403);
      expect(res.headers['content-type']).toContain('application/problem+json');
      const body = res.json<{ type: string; status: number; title: string }>();
      expect(body.status).toBe(403);
      expect(body.type).toBe('https://resto.app/problems/auth.tenant_mismatch');
    });

    it('accepts the same session when the request resolves the matching tenant (negative control)', async () => {
      const slugA = `xtenant-c-${randomUUID().slice(0, 8)}`;
      const passwordA = 'correct-horse-battery-staple-xtenant-C';
      const emailA = `owner-${slugA}@example.com`;

      const tenantA = await provisionTenant(app, slugA, INTERNAL_TOKEN);
      await runBootstrap({
        tenantSlug: slugA,
        email: emailA,
        password: passwordA,
        name: 'Cross-Tenant Owner C',
      });
      const cookieA = await signInAsOperator(app, emailA, passwordA, tenantA.id);

      const res = await app.inject({
        method: 'GET',
        url: '/v1/tenants/me',
        headers: { cookie: cookieA, 'x-tenant-slug': slugA },
      });

      expect(res.statusCode).toBe(200);
    });
  });

  describe('AuthGuard tenant-archive pre-check (RES-127)', () => {
    it('rejects every request bound to an archived tenant with tenant.archived', async () => {
      const slug = `archive-${randomUUID().slice(0, 8)}`;
      const password = 'correct-horse-battery-staple-archive-1';
      const email = `owner-${slug}@example.com`;

      const tenant = await provisionTenant(app, slug, INTERNAL_TOKEN);
      await runBootstrap({
        tenantSlug: slug,
        email,
        password,
        name: 'Archive Owner',
      });
      const cookie = await signInAsOperator(app, email, password, tenant.id);

      const okBefore = await app.inject({
        method: 'GET',
        url: '/v1/tenants/me',
        headers: { cookie, 'x-tenant-slug': slug },
      });
      expect(okBefore.statusCode).toBe(200);

      const archiveRes = await app.inject({
        method: 'POST',
        url: `/internal/v1/tenants/${tenant.id}/archive`,
        headers: { 'x-internal-token': INTERNAL_TOKEN },
      });
      expect(archiveRes.statusCode).toBe(204);

      const denied = await app.inject({
        method: 'GET',
        url: '/v1/tenants/me',
        headers: { cookie, 'x-tenant-slug': slug },
      });
      expect(denied.statusCode).toBe(403);
      expect(denied.headers['content-type']).toContain('application/problem+json');
      const body = denied.json<{ type: string; status: number }>();
      expect(body.status).toBe(403);
      expect(body.type).toBe('https://resto.app/problems/tenant.archived');
    });
  });

  // ---------------------------------------------------------------------------
  // GET /v1/tenants/me/domains
  // ---------------------------------------------------------------------------

  describe('GET /v1/tenants/me/domains', () => {
    it('returns 401 without auth', async () => {
      const res = await app.inject({ method: 'GET', url: '/v1/tenants/me/domains' });
      expect(res.statusCode).toBe(401);
    });

    it("returns the operator's tenant domains when authenticated", async () => {
      const slug = `op-${randomUUID().slice(0, 8)}`;
      const email = `owner-${slug}@example.com`;
      const password = 'correct-horse-battery-staple-tenants-2';

      const tenant = await provisionTenant(app, slug, INTERNAL_TOKEN);
      await runBootstrap({ tenantSlug: slug, email, password, name: 'Tenant Domains Owner' });
      const cookie = await signInAsOperator(app, email, password, tenant.id);

      const res = await app.inject({
        method: 'GET',
        url: '/v1/tenants/me/domains',
        headers: { cookie, 'x-tenant-slug': slug },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<{ domain: string; isPrimary: boolean }[]>();
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThan(0);

      // ProvisionTenantService creates a primary subdomain: <slug>.menu.resto.app
      const expectedDomain = `${slug}.menu.resto.app`;
      const primary = body.find((d) => d.domain === expectedDomain);
      expect(primary).toBeDefined();
      expect(primary?.isPrimary).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // POST /v1/tenants/me/offboard + DELETE /v1/tenants/me/offboard
  // ---------------------------------------------------------------------------

  describe('POST /v1/tenants/me/offboard', () => {
    it('returns 401 without auth', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/tenants/me/offboard',
        headers: { 'content-type': 'application/json' },
        payload: { requestedBy: 'user-id' },
      });
      expect(res.statusCode).toBe(401);
    });

    it('returns 403 for non-owner (admin role) — tenant:delete gate', async () => {
      const slug = `offboard-admin-${randomUUID().slice(0, 8)}`;
      const ownerEmail = `owner-${slug}@example.com`;
      const adminEmail = `admin-${slug}@example.com`;
      const password = 'correct-horse-battery-staple-offboard-1';

      const tenant = await provisionTenant(app, slug, INTERNAL_TOKEN);
      await runBootstrap({ tenantSlug: slug, email: ownerEmail, password, name: 'OB Owner' });
      const adminCookie = await addMemberWithRole(app, {
        tenantId: tenant.id,
        internalToken: INTERNAL_TOKEN,
        email: adminEmail,
        password,
        name: 'OB Admin',
        role: 'admin',
      });

      const res = await app.inject({
        method: 'POST',
        url: '/v1/tenants/me/offboard',
        headers: { 'content-type': 'application/json', cookie: adminCookie, 'x-tenant-slug': slug },
        payload: { requestedBy: adminEmail },
      });
      expect(res.statusCode).toBe(403);
    });

    it('returns 202 and sets offboardingScheduledAt for owner', async () => {
      const slug = `offboard-owner-${randomUUID().slice(0, 8)}`;
      const email = `owner-${slug}@example.com`;
      const password = 'correct-horse-battery-staple-offboard-2';

      const tenant = await provisionTenant(app, slug, INTERNAL_TOKEN);
      const { userId } = await runBootstrap({
        tenantSlug: slug,
        email,
        password,
        name: 'OB Owner 2',
      });
      const cookie = await signInAsOperator(app, email, password, tenant.id);

      const res = await app.inject({
        method: 'POST',
        url: '/v1/tenants/me/offboard',
        headers: { 'content-type': 'application/json', cookie, 'x-tenant-slug': slug },
        payload: { requestedBy: userId },
      });

      expect(res.statusCode).toBe(202);
      const body = res.json<{ id: string; offboardingScheduledAt: string | null }>();
      expect(body.id).toBe(tenant.id);
      expect(body.offboardingScheduledAt).not.toBeNull();
    });

    it('tenant is derived from session — no cross-tenant offboard via crafted payload', async () => {
      const slugA = `ob-iso-a-${randomUUID().slice(0, 8)}`;
      const slugB = `ob-iso-b-${randomUUID().slice(0, 8)}`;
      const passwordA = 'correct-horse-battery-staple-ob-iso-A';
      const emailA = `owner-${slugA}@example.com`;

      const tenantA = await provisionTenant(app, slugA, INTERNAL_TOKEN);
      await provisionTenant(app, slugB, INTERNAL_TOKEN);
      const { userId } = await runBootstrap({
        tenantSlug: slugA,
        email: emailA,
        password: passwordA,
        name: 'OB ISO A',
      });
      const cookieA = await signInAsOperator(app, emailA, passwordA, tenantA.id);

      // Sending slugB in x-tenant-slug header while authenticated as tenant A
      // resolves tenant B from middleware — session principal is for A, so
      // AuthGuard's tenant-mismatch check fires before the handler runs.
      const res = await app.inject({
        method: 'POST',
        url: '/v1/tenants/me/offboard',
        headers: {
          'content-type': 'application/json',
          cookie: cookieA,
          'x-tenant-slug': slugB,
        },
        payload: { requestedBy: userId },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('DELETE /v1/tenants/me/offboard', () => {
    it('returns 401 without auth', async () => {
      const res = await app.inject({ method: 'DELETE', url: '/v1/tenants/me/offboard' });
      expect(res.statusCode).toBe(401);
    });

    it('returns 403 for non-owner (admin role) — tenant:delete gate', async () => {
      const slug = `cancel-admin-${randomUUID().slice(0, 8)}`;
      const ownerEmail = `owner-${slug}@example.com`;
      const adminEmail = `admin-${slug}@example.com`;
      const password = 'correct-horse-battery-staple-cancel-1';

      const tenant = await provisionTenant(app, slug, INTERNAL_TOKEN);
      await runBootstrap({ tenantSlug: slug, email: ownerEmail, password, name: 'Cancel Owner' });
      const adminCookie = await addMemberWithRole(app, {
        tenantId: tenant.id,
        internalToken: INTERNAL_TOKEN,
        email: adminEmail,
        password,
        name: 'Cancel Admin',
        role: 'admin',
      });

      const res = await app.inject({
        method: 'DELETE',
        url: '/v1/tenants/me/offboard',
        headers: { cookie: adminCookie, 'x-tenant-slug': slug },
      });
      expect(res.statusCode).toBe(403);
    });

    it('returns 200 and clears offboardingScheduledAt for owner', async () => {
      const slug = `cancel-owner-${randomUUID().slice(0, 8)}`;
      const email = `owner-${slug}@example.com`;
      const password = 'correct-horse-battery-staple-cancel-2';

      const tenant = await provisionTenant(app, slug, INTERNAL_TOKEN);
      const { userId } = await runBootstrap({
        tenantSlug: slug,
        email,
        password,
        name: 'Cancel Owner 2',
      });
      const cookie = await signInAsOperator(app, email, password, tenant.id);

      // Schedule first
      const scheduleRes = await app.inject({
        method: 'POST',
        url: '/v1/tenants/me/offboard',
        headers: { 'content-type': 'application/json', cookie, 'x-tenant-slug': slug },
        payload: { requestedBy: userId },
      });
      expect(scheduleRes.statusCode).toBe(202);

      // Cancel
      const cancelRes = await app.inject({
        method: 'DELETE',
        url: '/v1/tenants/me/offboard',
        headers: { cookie, 'x-tenant-slug': slug },
      });
      expect(cancelRes.statusCode).toBe(200);
      const body = cancelRes.json<{ id: string; offboardingScheduledAt: string | null }>();
      expect(body.id).toBe(tenant.id);
      expect(body.offboardingScheduledAt).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // TenantDrizzleRepository — RLS enforcement (RES-242)
  // ---------------------------------------------------------------------------
  describe('TenantDrizzleRepository — RLS enforcement (RES-242)', () => {
    let repo: TenantRepository;
    let tenantA: { id: string; slug: string };
    let tenantB: { id: string; slug: string };

    beforeAll(async () => {
      repo = app.get<TenantRepository>(TENANT_REPOSITORY);
      const slugA = `repo-rls-a-${randomUUID().slice(0, 8)}`;
      const slugB = `repo-rls-b-${randomUUID().slice(0, 8)}`;
      tenantA = { ...(await provisionTenant(app, slugA, INTERNAL_TOKEN)), slug: slugA };
      tenantB = { ...(await provisionTenant(app, slugB, INTERNAL_TOKEN)), slug: slugB };
    });

    it('findCurrentTenant returns A when ALS is bound to A', async () => {
      const result = await runInTenantContext({ tenantId: tenantA.id }, () =>
        repo.findCurrentTenant(),
      );
      expect(result).not.toBeNull();
      expect(result?.toSnapshot().id).toBe(tenantA.id);
      expect(result?.toSnapshot().slug).toBe(tenantA.slug);
    });

    it('findCurrentTenant returns B when ALS is bound to B (cross-tenant isolation)', async () => {
      const result = await runInTenantContext({ tenantId: tenantB.id }, () =>
        repo.findCurrentTenant(),
      );
      expect(result?.toSnapshot().id).toBe(tenantB.id);
      expect(result?.toSnapshot().id).not.toBe(tenantA.id);
    });

    it('findCurrentTenant throws when called outside an ALS context', async () => {
      await expect(repo.findCurrentTenant()).rejects.toThrowError(/tenant context/i);
    });

    it('listCurrentTenantDomains returns A domains only when ALS bound to A', async () => {
      const domainsA = await runInTenantContext({ tenantId: tenantA.id }, () =>
        repo.listCurrentTenantDomains(),
      );
      const domainsB = await runInTenantContext({ tenantId: tenantB.id }, () =>
        repo.listCurrentTenantDomains(),
      );
      expect(domainsA.length).toBeGreaterThan(0);
      expect(domainsA.every((d) => d.tenantId === tenantA.id)).toBe(true);
      expect(domainsA.every((d) => d.tenantId !== tenantB.id)).toBe(true);
      expect(domainsB.length).toBeGreaterThan(0);
      expect(domainsB.every((d) => d.tenantId === tenantB.id)).toBe(true);
    });

    it('listCurrentTenantDomains throws when called outside an ALS context', async () => {
      await expect(repo.listCurrentTenantDomains()).rejects.toThrowError(/tenant context/i);
    });
  });
});
