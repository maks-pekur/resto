import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { assertNoBaCredentialAccess, BaCredentialAccessNotRevokedError } from '../../src/preflight';
import { logger } from '../../src/logger';
import postgres, { type Sql } from 'postgres';
import { isDockerAvailable, startPostgres, stopPostgres, type TestPg } from '../setup';

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;

if (!dockerOk) {
  console.warn('[preflight-ba-creds] Docker not available — skipping integration tests.');
}

suite('TEN-07: assertNoBaCredentialAccess boot preflight', () => {
  let pg: TestPg;
  let admin: Sql;

  beforeAll(async () => {
    pg = await startPostgres();
    admin = postgres(pg.adminUrl, { max: 1, prepare: false });
  }, 90_000);

  afterAll(async () => {
    await admin.end({ timeout: 5 });
    await stopPostgres(pg);
  });

  afterEach(async () => {
    // Defensive cleanup in case a test failed mid-way after granting.
    await admin`REVOKE SELECT, INSERT, UPDATE, DELETE ON account FROM resto_app`.catch(
      () => undefined,
    );
  });

  it('passes when migration 0027 is applied (no BA-credential grants)', async () => {
    await expect(assertNoBaCredentialAccess(pg.url)).resolves.toBeUndefined();
  });

  it('throws BaCredentialAccessNotRevokedError listing the offending grant when SELECT is re-introduced', async () => {
    await admin`GRANT SELECT ON account TO resto_app`;
    try {
      await assertNoBaCredentialAccess(pg.url);
      throw new Error('preflight should have thrown.');
    } catch (err) {
      expect(err).toBeInstanceOf(BaCredentialAccessNotRevokedError);
      const grants = (err as BaCredentialAccessNotRevokedError).grants;
      expect(grants).toContainEqual({ table: 'account', priv: 'SELECT' });
    } finally {
      await admin`REVOKE SELECT ON account FROM resto_app`;
    }
  });

  it('logs `{ checks: 12 }` exactly once on the success path', async () => {
    const spy = vi.spyOn(logger, 'info');
    try {
      await assertNoBaCredentialAccess(pg.url);
      const baCalls = spy.mock.calls.filter(([first]) => {
        return (
          typeof first === 'object' &&
          first !== null &&
          (first as { checks?: number }).checks === 12
        );
      });
      expect(baCalls).toHaveLength(1);
    } finally {
      spy.mockRestore();
    }
  });
});
