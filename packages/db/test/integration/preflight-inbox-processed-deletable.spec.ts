import postgres, { type Sql } from 'postgres';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  assertInboxProcessedDeletable,
  InboxProcessedDeleteMissingError,
} from '../../src/preflight';
import { isDockerAvailable, startPostgres, stopPostgres, type TestPg } from '../setup';

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;

if (!dockerOk) {
  console.warn('[preflight-inbox-processed-deletable] Docker not available — skipping.');
}

suite('TEN-13: assertInboxProcessedDeletable boot preflight', () => {
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
    await admin`GRANT DELETE ON inbox_processed TO resto_app`.catch(() => undefined);
  });

  it('passes when migration 0028 + roles.sql have granted DELETE', async () => {
    await expect(assertInboxProcessedDeletable(pg.url)).resolves.toBeUndefined();
  });

  it('throws InboxProcessedDeleteMissingError when GRANT DELETE is revoked', async () => {
    await admin`REVOKE DELETE ON inbox_processed FROM resto_app`;
    await expect(assertInboxProcessedDeletable(pg.url)).rejects.toBeInstanceOf(
      InboxProcessedDeleteMissingError,
    );
  });
});
