import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assertNoRlsBypass, RlsBypassError } from '../../src/index';
import { isDockerAvailable, startPostgres, stopPostgres, type TestPg } from '../setup';

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;

if (!dockerOk) {
  console.warn('[preflight] Docker not available — skipping integration tests.');
}

suite('assertNoRlsBypass', () => {
  let pg: TestPg;

  beforeAll(async () => {
    pg = await startPostgres();
  }, 90_000);

  afterAll(async () => {
    await stopPostgres(pg);
  });

  it('passes when connected as the runtime resto_app role', async () => {
    await expect(assertNoRlsBypass(pg.url)).resolves.toBeUndefined();
  });

  it('throws RlsBypassError when connected as the bootstrap superuser', async () => {
    await expect(assertNoRlsBypass(pg.adminUrl)).rejects.toBeInstanceOf(RlsBypassError);
  });

  it('error message mentions BYPASSRLS so the misconfiguration is obvious in logs', async () => {
    try {
      await assertNoRlsBypass(pg.adminUrl);
      throw new Error('preflight should have thrown.');
    } catch (err) {
      expect(err).toBeInstanceOf(RlsBypassError);
      expect((err as Error).message).toMatch(/BYPASSRLS|bypass row-level security/i);
    }
  });
});
