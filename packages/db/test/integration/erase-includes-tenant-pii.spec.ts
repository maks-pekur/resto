import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { isDockerAvailable, startPostgres, stopPostgres, type TestPg } from '../setup';
import { schema } from '../../src/index';

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;

if (!dockerOk) {
  console.warn('[erase-includes-tenant-pii] Docker not available — skipping.');
}

const SALT = 'test-salt-must-be-at-least-32-chars';

// Migration 0080 (10.2 plan 18): 0079 merged the deleted `brands` table's
// legal fields onto `tenants` but dropped `DELETE FROM brands` from
// tenancy_erase_tenant without replacing it — a real GDPR erasure was
// silently leaving a restaurant's legal name and tax id behind. 0080 fixed
// the function; this is the regression net that would have caught it.
suite(
  'tenancy_erase_tenant — anonymizes tenant-owned PII merged in from brands (10.2 plan 19)',
  () => {
    let pg: TestPg;
    let tenantId: string;

    beforeAll(async () => {
      pg = await startPostgres();
      await pg.db.withoutTenant('seed tenant PII erase fixture', async (tx) => {
        const [t] = await tx
          .insert(schema.tenants)
          .values({
            slug: 'erase-tenant-pii',
            displayName: 'Erase Tenant PII',
            country: 'GB',
            legalName: 'Erase Tenant PII Ltd',
            legalForm: 'LLC',
            taxId: 'GB123456789',
            stripeAccountId: 'acct_erase_pii_test',
          })
          .returning({ id: schema.tenants.id });
        if (!t) throw new Error('seed tenant failed');
        tenantId = t.id;
      });
    }, 90_000);

    afterAll(async () => {
      await stopPostgres(pg);
    });

    it('nulls legal_name/legal_form/tax_id/stripe_account_id but keeps the tenant row (no hard delete)', async () => {
      await pg.db.withoutTenant('run erase', async (tx) => {
        await tx.execute(sql`SELECT app_allow_erasure(${tenantId}::uuid)`);
        await tx.execute(
          sql`SELECT tenancy_erase_tenant(${tenantId}::uuid, ${SALT}, 'test:erase-includes-tenant-pii')`,
        );
      });

      const rows = await pg.db.withoutTenant('assert tenant PII anonymized', async (tx) =>
        tx.select().from(schema.tenants).where(eq(schema.tenants.id, tenantId)),
      );
      expect(rows).toHaveLength(1);
      const tenant = rows[0];
      expect(tenant?.legalName).toBeNull();
      expect(tenant?.legalForm).toBeNull();
      expect(tenant?.taxId).toBeNull();
      expect(tenant?.stripeAccountId).toBeNull();
    });
  },
);
