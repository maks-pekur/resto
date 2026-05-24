import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres, { type Sql } from 'postgres';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { provisionAuthRole, RESTO_AUTH_ROLE } from '../../src/index';
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
        INSERT INTO tenants (slug, display_name) VALUES ('auth-grants-t', 'AuthGrants T')
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
    it('cannot SELECT from menu_items, outbox_events, audit_log, brands, customer_profiles, member_brand_scope', async () => {
      await expectPermissionDenied(authClient`SELECT 1 FROM menu_items LIMIT 1`);
      await expectPermissionDenied(authClient`SELECT 1 FROM outbox_events LIMIT 1`);
      await expectPermissionDenied(authClient`SELECT 1 FROM audit_log LIMIT 1`);
      await expectPermissionDenied(authClient`SELECT 1 FROM brands LIMIT 1`);
      await expectPermissionDenied(authClient`SELECT 1 FROM customer_profiles LIMIT 1`);
      await expectPermissionDenied(authClient`SELECT 1 FROM member_brand_scope LIMIT 1`);
    });

    it('cannot INSERT into brands', async () => {
      await expectPermissionDenied(authClient`
        INSERT INTO brands (tenant_id, slug, display_name)
        VALUES (${tenantId}, 'forged', 'Forged Brand')
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
        INSERT INTO tenants (slug, display_name) VALUES ('forged-by-auth', 'Forged')
      `);
    });

    it('cannot DELETE from tenants', async () => {
      await expectPermissionDenied(authClient`DELETE FROM tenants WHERE id = ${tenantId}`);
    });
  });
});
