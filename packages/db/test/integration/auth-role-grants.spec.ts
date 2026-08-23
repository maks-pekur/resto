import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres, { type Sql } from 'postgres';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import {
  provisionAuthRole,
  RESTO_AUTH_ROLE,
  provisionAppRole,
  RESTO_APP_ROLE,
} from '../../src/index';
import { isDockerAvailable } from '../setup';

const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../migrations', import.meta.url));
const AUTH_PWD = 'auth_role_grants_test_pwd_1234';

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;

if (!dockerOk) {
  console.warn('[auth-role-grants] Docker not available — skipping integration tests.');
}

const expectPermissionDenied = async <T>(p: Promise<T>): Promise<void> => {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(Error);
  expect((err as { code?: string }).code).toBe('42501');
};

suite('RES-205: resto_auth role grants are restricted to BA-owned tables', () => {
  let container: StartedPostgreSqlContainer;
  let authClient: Sql;
  let tenantId: string;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('resto_test')
      .withUsername('resto_test')
      .withPassword('resto_test')
      .start();

    const adminUrl = container.getConnectionUri();
    const admin = postgres(adminUrl, { max: 1, prepare: false });
    try {
      await migrate(drizzle(admin), { migrationsFolder: MIGRATIONS_FOLDER });
      await provisionAuthRole(admin, { authPassword: AUTH_PWD });

      const [t] = await admin<{ id: string }[]>`
        INSERT INTO tenants (slug, display_name, country) VALUES ('auth-grants-t', 'AuthGrants T', 'GB')
        RETURNING id
      `;
      if (!t) throw new Error('failed to seed tenant');
      tenantId = t.id;
    } finally {
      await admin.end({ timeout: 5 });
    }

    const authUrl = new URL(adminUrl);
    authUrl.username = RESTO_AUTH_ROLE;
    authUrl.password = AUTH_PWD;
    authClient = postgres(authUrl.toString(), { max: 1, prepare: false });
  }, 90_000);

  afterAll(async () => {
    await authClient.end({ timeout: 5 });
    await container.stop({ timeout: 5_000 });
  });

  describe('domain tables — privileges MUST be denied', () => {
    it('cannot SELECT from menu_items, outbox_events, audit_log, customer_profiles', async () => {
      await expectPermissionDenied(authClient`SELECT 1 FROM menu_items LIMIT 1`);
      await expectPermissionDenied(authClient`SELECT 1 FROM outbox_events LIMIT 1`);
      await expectPermissionDenied(authClient`SELECT 1 FROM audit_log LIMIT 1`);
      await expectPermissionDenied(authClient`SELECT 1 FROM customer_profiles LIMIT 1`);
    });

    it('cannot INSERT into menu_items', async () => {
      await expectPermissionDenied(authClient`
        INSERT INTO menu_items (tenant_id, category_id, slug, name, base_price, currency, status)
        VALUES (${tenantId}, gen_random_uuid(), 'forged', '{}'::jsonb, '0.00', 'USD', 'draft')
      `);
    });

    it('cannot UPDATE menu_items', async () => {
      await expectPermissionDenied(authClient`UPDATE menu_items SET name = '{}'::jsonb`);
    });

    it('cannot DELETE from outbox_events', async () => {
      await expectPermissionDenied(authClient`DELETE FROM outbox_events`);
    });
  });

  describe('BA-owned tables — full CRUD must succeed', () => {
    it('can SELECT / INSERT / UPDATE / DELETE on "user"', async () => {
      const id = `ba-grants-${Date.now()}`;
      await authClient`SELECT 1 FROM "user" LIMIT 1`;
      await authClient`
        INSERT INTO "user" (id, name, email, email_verified, requires_password_change)
        VALUES (${id}, 'AuthGrants', ${`${id}@example.com`}, false, false)
      `;
      await authClient`UPDATE "user" SET name = 'AuthGrants Updated' WHERE id = ${id}`;
      await authClient`DELETE FROM "user" WHERE id = ${id}`;
    });

    it('can SELECT / INSERT / DELETE on session', async () => {
      const userId = `ba-sess-u-${Date.now()}`;
      const sessId = `ba-sess-s-${Date.now()}`;
      await authClient`
        INSERT INTO "user" (id, name, email, email_verified, requires_password_change)
        VALUES (${userId}, 'SessOwner', ${`${userId}@example.com`}, false, false)
      `;
      try {
        await authClient`
          INSERT INTO session (id, expires_at, token, updated_at, user_id)
          VALUES (${sessId}, now() + interval '1 hour', ${`tok-${sessId}`}, now(), ${userId})
        `;
        const rows = await authClient`SELECT 1 FROM session WHERE id = ${sessId}`;
        expect(rows.length).toBe(1);
        await authClient`DELETE FROM session WHERE id = ${sessId}`;
      } finally {
        await authClient`DELETE FROM "user" WHERE id = ${userId}`;
      }
    });
  });

  describe('tenants (BA "organization" mapping per ADR-0013) — SELECT + UPDATE only', () => {
    it('can SELECT tenants', async () => {
      const rows = await authClient`SELECT id FROM tenants WHERE id = ${tenantId}`;
      expect(rows.length).toBe(1);
    });

    it('can UPDATE tenants (org-rename hook)', async () => {
      await authClient`UPDATE tenants SET display_name = 'Renamed via BA' WHERE id = ${tenantId}`;
    });

    it('cannot INSERT into tenants (lifecycle owned by tenancy context)', async () => {
      await expectPermissionDenied(authClient`
        INSERT INTO tenants (slug, display_name, country) VALUES ('forged-by-auth', 'Forged', 'GB')
      `);
    });

    it('cannot DELETE from tenants', async () => {
      await expectPermissionDenied(authClient`DELETE FROM tenants WHERE id = ${tenantId}`);
    });
  });
});

const APP_PWD = 'app_role_206_test_pwd_1234';

suite('RES-206: resto_app cannot access BA credential tables', () => {
  let container: StartedPostgreSqlContainer;
  let appClient: Sql;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('resto_test')
      .withUsername('resto_test')
      .withPassword('resto_test')
      .start();

    const adminUrl = container.getConnectionUri();
    const admin = postgres(adminUrl, { max: 1, prepare: false });
    try {
      await migrate(drizzle(admin), { migrationsFolder: MIGRATIONS_FOLDER });
      await provisionAppRole(admin, { appPassword: APP_PWD });
    } finally {
      await admin.end({ timeout: 5 });
    }

    const appUrl = new URL(adminUrl);
    appUrl.username = RESTO_APP_ROLE;
    appUrl.password = APP_PWD;
    appClient = postgres(appUrl.toString(), { max: 1, prepare: false });
  }, 90_000);

  afterAll(async () => {
    await appClient.end({ timeout: 5 });
    await container.stop({ timeout: 5_000 });
  });

  it('cannot SELECT from account', async () => {
    await expectPermissionDenied(appClient`SELECT 1 FROM account LIMIT 1`);
  });

  it('cannot SELECT from two_factor', async () => {
    await expectPermissionDenied(appClient`SELECT 1 FROM two_factor LIMIT 1`);
  });

  it('cannot SELECT from verification', async () => {
    await expectPermissionDenied(appClient`SELECT 1 FROM verification LIMIT 1`);
  });

  it('cannot SELECT from session', async () => {
    await expectPermissionDenied(appClient`SELECT 1 FROM session LIMIT 1`);
  });

  it('STILL has SELECT on member (sanity — not over-revoked)', async () => {
    await appClient`SELECT 1 FROM member LIMIT 1`;
  });

  it('STILL has SELECT on "user" (sanity — not over-revoked)', async () => {
    await appClient`SELECT 1 FROM "user" LIMIT 1`;
  });
});

// ─── D-04 / 07.5-05: policy-based access (NOBYPASSRLS) suites ───────────────

const NOBYPASS_AUTH_PWD = 'nobypass_auth_test_pwd_1234';
const NOBYPASS_APP_PWD = 'nobypass_app_test_pwd_1234';

suite(
  'D-04: resto_auth operates on RLS-enabled BA tables WITHOUT BYPASSRLS (via permissive policies)',
  () => {
    let container: StartedPostgreSqlContainer;
    let authClient: Sql;
    let tenantId: string;
    let orgMemberId: string;
    let invitationId: string;
    let orgRoleId: string;

    beforeAll(async () => {
      container = await new PostgreSqlContainer('postgres:16-alpine')
        .withDatabase('resto_test')
        .withUsername('resto_test')
        .withPassword('resto_test')
        .start();

      const adminUrl = container.getConnectionUri();
      const admin = postgres(adminUrl, { max: 1, prepare: false });
      try {
        await migrate(drizzle(admin), { migrationsFolder: MIGRATIONS_FOLDER });
        await provisionAuthRole(admin, { authPassword: NOBYPASS_AUTH_PWD });

        const [t] = await admin<{ id: string }[]>`
          INSERT INTO tenants (slug, display_name, country) VALUES ('nobypass-t', 'NoBypasS T', 'GB')
          RETURNING id
        `;
        if (!t) throw new Error('failed to seed tenant');
        tenantId = t.id;

        // Seed a BA "user" row so member/invitation FKs resolve.
        const userId = `nobypass-u-${Date.now()}`;
        await admin`
          INSERT INTO "user" (id, name, email, email_verified, requires_password_change)
          VALUES (${userId}, 'NoBypass', ${'nb@example.com'}, false, false)
        `;

        orgMemberId = `nobypass-m-${Date.now()}`;
        invitationId = `nobypass-i-${Date.now()}`;
        orgRoleId = `nobypass-r-${Date.now()}`;

        // Pre-seed member/invitation/tenant_role as admin so resto_auth
        // can UPDATE and DELETE them in the CRUD round-trip below.
        await admin`
          INSERT INTO member (id, tenant_id, user_id, role, created_at)
          VALUES (${orgMemberId}, ${tenantId}, ${userId}, 'member', now())
        `;
        await admin`
          INSERT INTO invitation (id, tenant_id, email, role, status, inviter_id, expires_at)
          VALUES (${invitationId}, ${tenantId}, 'invite@example.com', 'member', 'pending', ${userId}, now() + interval '1 day')
        `;
        await admin`
          INSERT INTO tenant_role (id, tenant_id, role, permission)
          VALUES (${orgRoleId}, ${tenantId}, 'editor', 'create:content')
        `;
      } finally {
        await admin.end({ timeout: 5 });
      }

      const authUrl = new URL(adminUrl);
      authUrl.username = RESTO_AUTH_ROLE;
      authUrl.password = NOBYPASS_AUTH_PWD;
      // Connect as resto_auth WITHOUT setting app.current_tenant — only the
      // permissive USING(true) policy can make rows visible.
      authClient = postgres(authUrl.toString(), { max: 1, prepare: false });
    }, 90_000);

    afterAll(async () => {
      await authClient.end({ timeout: 5 });
      await container.stop({ timeout: 5_000 });
    });

    it('resto_auth is provisioned NOBYPASSRLS (control: no residual bypass)', async () => {
      const rows = await authClient<{ rolbypassrls: boolean }[]>`
        SELECT rolbypassrls FROM pg_roles WHERE rolname = 'resto_auth'
      `;
      expect(rows[0]?.rolbypassrls).toBe(false);
    });

    it('can SELECT / INSERT / UPDATE / DELETE on member WITHOUT setting app.current_tenant', async () => {
      // SELECT pre-seeded row — permissive USING(true) makes it visible.
      const sel = await authClient<{ id: string }[]>`
        SELECT id FROM member WHERE id = ${orgMemberId}
      `;
      expect(sel.length).toBe(1);

      const newId = `nobypass-m2-${Date.now()}`;
      const userId2 = `nobypass-u2-${Date.now()}`;
      await authClient`
        INSERT INTO "user" (id, name, email, email_verified, requires_password_change)
        VALUES (${userId2}, 'U2', ${'u2@example.com'}, false, false)
      `;
      await authClient`
        INSERT INTO member (id, tenant_id, user_id, role, created_at)
        VALUES (${newId}, ${tenantId}, ${userId2}, 'admin', now())
      `;
      await authClient`UPDATE member SET role = 'owner' WHERE id = ${newId}`;
      await authClient`DELETE FROM member WHERE id = ${newId}`;
    });

    it('can SELECT / INSERT / UPDATE / DELETE on invitation WITHOUT setting app.current_tenant', async () => {
      const sel = await authClient<{ id: string }[]>`
        SELECT id FROM invitation WHERE id = ${invitationId}
      `;
      expect(sel.length).toBe(1);

      const newInvId = `nobypass-i2-${Date.now()}`;
      const invUserId = `nobypass-iu-${Date.now()}`;
      await authClient`
        INSERT INTO "user" (id, name, email, email_verified, requires_password_change)
        VALUES (${invUserId}, 'InvU', ${'invu@example.com'}, false, false)
      `;
      await authClient`
        INSERT INTO invitation (id, tenant_id, email, role, status, inviter_id, expires_at)
        VALUES (${newInvId}, ${tenantId}, 'newinvite@example.com', 'member', 'pending', ${invUserId}, now() + interval '1 day')
      `;
      await authClient`UPDATE invitation SET status = 'accepted' WHERE id = ${newInvId}`;
      await authClient`DELETE FROM invitation WHERE id = ${newInvId}`;
    });

    it('can SELECT / INSERT / UPDATE / DELETE on tenant_role WITHOUT setting app.current_tenant', async () => {
      const sel = await authClient<{ id: string }[]>`
        SELECT id FROM tenant_role WHERE id = ${orgRoleId}
      `;
      expect(sel.length).toBe(1);

      const newRoleId = `nobypass-r2-${Date.now()}`;
      await authClient`
        INSERT INTO tenant_role (id, tenant_id, role, permission)
        VALUES (${newRoleId}, ${tenantId}, 'viewer', 'read:content')
      `;
      await authClient`UPDATE tenant_role SET role = 'reader' WHERE id = ${newRoleId}`;
      await authClient`DELETE FROM tenant_role WHERE id = ${newRoleId}`;
    });

    it('can SELECT / UPDATE on tenants WITHOUT setting app.current_tenant', async () => {
      const sel = await authClient<{ id: string }[]>`
        SELECT id FROM tenants WHERE id = ${tenantId}
      `;
      expect(sel.length).toBe(1);
      await authClient`UPDATE tenants SET display_name = 'Renamed by auth' WHERE id = ${tenantId}`;
    });

    it('is still denied on domain tables not granted to resto_auth (menu_categories)', async () => {
      // Proves access comes from grant+policy, not a residual bypass.
      await expectPermissionDenied(authClient`SELECT 1 FROM menu_categories LIMIT 1`);
    });
  },
);

suite('D-04: resto_app isolation is intact after the resto_auth permissive-policy change', () => {
  let container: StartedPostgreSqlContainer;
  let appClient: Sql;
  let tenantAId: string;
  let tenantBId: string;
  let memberAId: string;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('resto_test')
      .withUsername('resto_test')
      .withPassword('resto_test')
      .start();

    const adminUrl = container.getConnectionUri();
    const admin = postgres(adminUrl, { max: 1, prepare: false });
    try {
      await migrate(drizzle(admin), { migrationsFolder: MIGRATIONS_FOLDER });
      await provisionAuthRole(admin, { authPassword: NOBYPASS_AUTH_PWD });
      await provisionAppRole(admin, { appPassword: NOBYPASS_APP_PWD });

      const [tA] = await admin<{ id: string }[]>`
        INSERT INTO tenants (slug, display_name, country) VALUES ('iso-a', 'Iso A', 'GB') RETURNING id
      `;
      const [tB] = await admin<{ id: string }[]>`
        INSERT INTO tenants (slug, display_name, country) VALUES ('iso-b', 'Iso B', 'GB') RETURNING id
      `;
      if (!tA || !tB) throw new Error('failed to seed isolation tenants');
      tenantAId = tA.id;
      tenantBId = tB.id;

      // Seed a user + member for tenant A so the member table has a row.
      const userId = `iso-u-${Date.now()}`;
      await admin`
        INSERT INTO "user" (id, name, email, email_verified, requires_password_change)
        VALUES (${userId}, 'IsoU', ${'isou@example.com'}, false, false)
      `;
      memberAId = `iso-m-${Date.now()}`;
      await admin`
        INSERT INTO member (id, tenant_id, user_id, role, created_at)
        VALUES (${memberAId}, ${tenantAId}, ${userId}, 'member', now())
      `;
    } finally {
      await admin.end({ timeout: 5 });
    }

    const appUrl = new URL(adminUrl);
    appUrl.username = RESTO_APP_ROLE;
    appUrl.password = NOBYPASS_APP_PWD;
    appClient = postgres(appUrl.toString(), { max: 1, prepare: false });
  }, 90_000);

  afterAll(async () => {
    await appClient.end({ timeout: 5 });
    await container.stop({ timeout: 5_000 });
  });

  it('resto_app is denied on account (BA credential table isolation unchanged)', async () => {
    await expectPermissionDenied(appClient`SELECT 1 FROM account LIMIT 1`);
  });

  it('resto_app is denied on session', async () => {
    await expectPermissionDenied(appClient`SELECT 1 FROM session LIMIT 1`);
  });

  it('resto_app is denied on two_factor', async () => {
    await expectPermissionDenied(appClient`SELECT 1 FROM two_factor LIMIT 1`);
  });

  it('resto_app is denied on verification', async () => {
    await expectPermissionDenied(appClient`SELECT 1 FROM verification LIMIT 1`);
  });

  it('cross-tenant SELECT on member returns 0 rows for tenant B when bound to tenant A', async () => {
    // Bind the session to tenant A via app_bind_tenant (the same path
    // withTenant() uses), then SELECT member filtering by tenant B's id.
    // The resto_auth permissive policy is NOT applicable to resto_app,
    // so tenant B's rows remain invisible — FORCE RLS is unaffected.
    await appClient`SELECT app_bind_tenant(${tenantAId}, false)`;
    const rows = await appClient<{ id: string }[]>`
      SELECT id FROM member WHERE tenant_id = ${tenantBId}
    `;
    expect(rows).toHaveLength(0);
  });

  it('cross-tenant SELECT on tenants returns 0 rows for tenant B when bound to tenant A', async () => {
    // Reuse the bound session (app_bind_tenant is idempotent on same tenant).
    const rows = await appClient<{ id: string }[]>`
      SELECT id FROM tenants WHERE id = ${tenantBId}
    `;
    expect(rows).toHaveLength(0);
  });
});
