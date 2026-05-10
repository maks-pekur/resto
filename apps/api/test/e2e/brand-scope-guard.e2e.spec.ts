import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { runInTenantContext, schema } from '@resto/db';
import { TenantId } from '@resto/domain';
import { MemberBrandScopeDrizzleReader } from '../../src/contexts/identity/infrastructure/member-brand-scope-drizzle.reader';
import {
  isDockerAvailable,
  startDbStack,
  stopDbStack,
  type DbStack,
} from './helpers/with-db-stack';

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;

if (!dockerOk) {
  console.warn('[brand-scope-guard.e2e] Docker not available — skipping.');
}

const TENANT_A_ID = randomUUID();
const TENANT_B_ID = randomUUID();
const BRAND_A1_ID = randomUUID();
const BRAND_A2_ID = randomUUID();
const BRAND_B1_ID = randomUUID();

const USER_UNSCOPED = 'user-unscoped';
const USER_SCOPED = 'user-scoped';
const USER_OTHER_TENANT = 'user-other-tenant';

const MEMBER_UNSCOPED = 'member-unscoped';
const MEMBER_SCOPED = 'member-scoped';
const MEMBER_OTHER_TENANT = 'member-other-tenant';

suite('MemberBrandScopeDrizzleReader', () => {
  let stack: DbStack;
  let reader: MemberBrandScopeDrizzleReader;

  beforeAll(async () => {
    stack = await startDbStack();
    reader = new MemberBrandScopeDrizzleReader(stack.db);

    await stack.db.withoutTenant('seed for brand-scope reader test', async (tx) => {
      await tx.insert(schema.tenants).values([
        { id: TENANT_A_ID, slug: 'scope-a', displayName: 'Scope A' },
        { id: TENANT_B_ID, slug: 'scope-b', displayName: 'Scope B' },
      ]);
      await tx.insert(schema.brands).values([
        { id: BRAND_A1_ID, tenantId: TENANT_A_ID, slug: 'brand-a1', displayName: 'A1' },
        { id: BRAND_A2_ID, tenantId: TENANT_A_ID, slug: 'brand-a2', displayName: 'A2' },
        { id: BRAND_B1_ID, tenantId: TENANT_B_ID, slug: 'brand-b1', displayName: 'B1' },
      ]);
      await tx.insert(schema.user).values([
        { id: USER_UNSCOPED, email: 'unscoped@test', emailVerified: true, name: 'Unscoped' },
        { id: USER_SCOPED, email: 'scoped@test', emailVerified: true, name: 'Scoped' },
        { id: USER_OTHER_TENANT, email: 'other@test', emailVerified: true, name: 'Other' },
      ]);
      await tx.insert(schema.member).values([
        {
          id: MEMBER_UNSCOPED,
          userId: USER_UNSCOPED,
          organizationId: TENANT_A_ID,
          role: 'staff',
          createdAt: new Date(),
        },
        {
          id: MEMBER_SCOPED,
          userId: USER_SCOPED,
          organizationId: TENANT_A_ID,
          role: 'staff',
          createdAt: new Date(),
        },
        {
          id: MEMBER_OTHER_TENANT,
          userId: USER_OTHER_TENANT,
          organizationId: TENANT_B_ID,
          role: 'staff',
          createdAt: new Date(),
        },
      ]);
      await tx.insert(schema.memberBrandScope).values([
        { memberId: MEMBER_SCOPED, brandId: BRAND_A1_ID, tenantId: TENANT_A_ID },
        { memberId: MEMBER_OTHER_TENANT, brandId: BRAND_B1_ID, tenantId: TENANT_B_ID },
      ]);
    });
  }, 90_000);

  afterAll(async () => {
    await stopDbStack(stack);
  });

  it('returns null when the member has no scope rows', async () => {
    const result = await runInTenantContext({ tenantId: TENANT_A_ID }, () =>
      reader.findBrandScopeForMember({
        userId: USER_UNSCOPED,
        tenantId: TenantId.parse(TENANT_A_ID),
      }),
    );
    expect(result).toBeNull();
  });

  it('returns the explicit scope set when rows exist', async () => {
    const result = await runInTenantContext({ tenantId: TENANT_A_ID }, () =>
      reader.findBrandScopeForMember({
        userId: USER_SCOPED,
        tenantId: TenantId.parse(TENANT_A_ID),
      }),
    );
    expect(result).toEqual([BRAND_A1_ID]);
  });

  it('does not leak another tenants scope rows even when the userId matches', async () => {
    const result = await runInTenantContext({ tenantId: TENANT_A_ID }, () =>
      reader.findBrandScopeForMember({
        userId: USER_OTHER_TENANT,
        tenantId: TenantId.parse(TENANT_A_ID),
      }),
    );
    expect(result).toBeNull();
  });
});
