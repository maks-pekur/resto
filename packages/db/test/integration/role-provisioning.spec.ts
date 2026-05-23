import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import {
  provisionAppRole,
  provisionAuthRole,
  RESTO_APP_ROLE,
  RESTO_AUTH_ROLE,
} from '../../src/index';
import { assertRoleAttributes, RoleAttributeMismatchError } from '../../src/preflight';
import { isDockerAvailable, startPostgres, stopPostgres, type TestPg } from '../setup';

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;

if (!dockerOk) {
  console.warn('[role-provisioning] Docker not available — skipping integration tests.');
}

const APP_PWD = 'role_provisioning_app_pwd_1234';
const AUTH_PWD = 'role_provisioning_auth_pwd_1234';

suite('Role provisioning — end-to-end (RES-245)', () => {
  let pg: TestPg;
  let admin: ReturnType<typeof postgres>;

  beforeAll(async () => {
    pg = await startPostgres();
    admin = postgres(pg.adminUrl, { max: 1, prepare: false });
  }, 90_000);

  afterAll(async () => {
    await admin.end({ timeout: 5 });
    await stopPostgres(pg);
  });

  it('provisionAppRole produces resto_app with NOSUPERUSER NOBYPASSRLS', async () => {
    await provisionAppRole(admin, { appPassword: APP_PWD });
    await assertRoleAttributes(admin, RESTO_APP_ROLE, {
      rolsuper: false,
      rolbypassrls: false,
      rolcreaterole: false,
      rolcreatedb: false,
    });
  });

  it('provisionAuthRole produces resto_auth with NOSUPERUSER BYPASSRLS', async () => {
    await provisionAuthRole(admin, { authPassword: AUTH_PWD });
    await assertRoleAttributes(admin, RESTO_AUTH_ROLE, {
      rolsuper: false,
      rolbypassrls: true,
      rolcreaterole: false,
      rolcreatedb: false,
    });
  });

  it('assertRoleAttributes throws RoleAttributeMismatchError when role is tampered with', async () => {
    await admin.unsafe('ALTER ROLE resto_app WITH SUPERUSER');
    try {
      const err = await assertRoleAttributes(admin, RESTO_APP_ROLE, {
        rolsuper: false,
        rolbypassrls: false,
        rolcreaterole: false,
        rolcreatedb: false,
      }).then(
        () => null,
        (e: unknown) => e,
      );
      expect(err).toBeInstanceOf(RoleAttributeMismatchError);
    } finally {
      await admin.unsafe('ALTER ROLE resto_app WITH NOSUPERUSER');
    }
  });

  it('assertRoleAttributes throws when the role does not exist', async () => {
    await expect(
      assertRoleAttributes(admin, 'role_that_never_existed', {
        rolsuper: false,
        rolbypassrls: false,
        rolcreaterole: false,
        rolcreatedb: false,
      }),
    ).rejects.toThrow(/does not exist/);
  });

  it('provisionAppRole is idempotent — second call updates password without error', async () => {
    await provisionAppRole(admin, { appPassword: 'role_idempotency_app_pwd' });
    const appUrl = new URL(pg.adminUrl);
    appUrl.username = RESTO_APP_ROLE;
    appUrl.password = 'role_idempotency_app_pwd';
    const appClient = postgres(appUrl.toString(), { max: 1, prepare: false });
    try {
      const result = await appClient`SELECT current_user AS user`;
      expect(result[0]?.user).toBe(RESTO_APP_ROLE);
    } finally {
      await appClient.end({ timeout: 5 });
    }
  });

  it('provisionAppRole rejects an injection-attempt password before any SQL is sent', async () => {
    const malicious = "abcdef1234567890'; ALTER ROLE resto_app SUPERUSER; --";
    await expect(provisionAppRole(admin, { appPassword: malicious })).rejects.toThrow(/whitelist/i);
    await assertRoleAttributes(admin, RESTO_APP_ROLE, {
      rolsuper: false,
      rolbypassrls: false,
      rolcreaterole: false,
      rolcreatedb: false,
    });
  });
});
