import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { runInTenantContext, schema } from '@resto/db';
import { TenantId } from '@resto/domain';
import { MemberLocationScopeDrizzleReader } from '../../src/contexts/identity/infrastructure/member-location-scope-drizzle.reader';
import {
  isDockerAvailable,
  startDbStack,
  stopDbStack,
  type DbStack,
} from './helpers/with-db-stack';

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;

if (!dockerOk) {
  console.warn('[member-location-scope-reader.e2e] Docker not available — skipping.');
}

const TENANT_A_ID = randomUUID();
const TENANT_B_ID = randomUUID();
const LOCATION_A1_ID = randomUUID();
const LOCATION_A2_ID = randomUUID();
const LOCATION_B1_ID = randomUUID();

const USER_UNSCOPED = 'user-unscoped';
const USER_SCOPED = 'user-scoped';
const USER_OTHER_TENANT = 'user-other-tenant';

const MEMBER_UNSCOPED = 'member-unscoped';
const MEMBER_SCOPED = 'member-scoped';
const MEMBER_OTHER_TENANT = 'member-other-tenant';

// Replaces the deleted pre-merge per-restaurant-label scope reader spec
// (10.2 plan 19): that file exercised the deleted per-label scope reader
// class, removed with that dimension (D-10). The isolation property it
// proved — a reader backed by a real DB query must not leak another
// tenant's scope rows even when the userId matches — has a direct
// location-scoped successor (MemberLocationScopeDrizzleReader) and no
// other test exercises it against a live database: location-scope.guard.
// spec.ts mocks the reader entirely.
suite('MemberLocationScopeDrizzleReader', () => {
  let stack: DbStack;
  let reader: MemberLocationScopeDrizzleReader;

  beforeAll(async () => {
    stack = await startDbStack();
    reader = new MemberLocationScopeDrizzleReader(stack.db);

    await stack.db.withoutTenant('seed for location-scope reader test', async (tx) => {
      await tx.insert(schema.tenants).values([
        { id: TENANT_A_ID, slug: 'loc-scope-a', displayName: 'Scope A', country: 'GB' },
        { id: TENANT_B_ID, slug: 'loc-scope-b', displayName: 'Scope B', country: 'GB' },
      ]);
      await tx.insert(schema.locations).values([
        { id: LOCATION_A1_ID, tenantId: TENANT_A_ID, name: 'A1', slug: 'a1' },
        { id: LOCATION_A2_ID, tenantId: TENANT_A_ID, name: 'A2', slug: 'a2' },
        { id: LOCATION_B1_ID, tenantId: TENANT_B_ID, name: 'B1', slug: 'b1' },
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
          tenantId: TENANT_A_ID,
          role: 'staff',
          createdAt: new Date(),
        },
        {
          id: MEMBER_SCOPED,
          userId: USER_SCOPED,
          tenantId: TENANT_A_ID,
          role: 'staff',
          createdAt: new Date(),
        },
        {
          id: MEMBER_OTHER_TENANT,
          userId: USER_OTHER_TENANT,
          tenantId: TENANT_B_ID,
          role: 'staff',
          createdAt: new Date(),
        },
      ]);
      await tx.insert(schema.memberLocationScope).values([
        { memberId: MEMBER_SCOPED, locationId: LOCATION_A1_ID, tenantId: TENANT_A_ID },
        { memberId: MEMBER_OTHER_TENANT, locationId: LOCATION_B1_ID, tenantId: TENANT_B_ID },
      ]);
    });
  }, 90_000);

  afterAll(async () => {
    await stopDbStack(stack);
  });

  it('returns null when the member has no scope rows', async () => {
    const result = await runInTenantContext({ tenantId: TENANT_A_ID }, () =>
      reader.findLocationScopeForMember({
        userId: USER_UNSCOPED,
        tenantId: TenantId.parse(TENANT_A_ID),
      }),
    );
    expect(result).toBeNull();
  });

  it('returns the explicit scope set when rows exist', async () => {
    const result = await runInTenantContext({ tenantId: TENANT_A_ID }, () =>
      reader.findLocationScopeForMember({
        userId: USER_SCOPED,
        tenantId: TenantId.parse(TENANT_A_ID),
      }),
    );
    expect(result).toEqual([LOCATION_A1_ID]);
  });

  it('does not leak another tenants scope rows even when the userId matches', async () => {
    const result = await runInTenantContext({ tenantId: TENANT_A_ID }, () =>
      reader.findLocationScopeForMember({
        userId: USER_OTHER_TENANT,
        tenantId: TenantId.parse(TENANT_A_ID),
      }),
    );
    expect(result).toBeNull();
  });

  it('findPinnableLocations for a non-owner returns only the scoped location, not sibling tenant locations', async () => {
    const result = await runInTenantContext({ tenantId: TENANT_A_ID }, () =>
      reader.findPinnableLocations({
        userId: USER_SCOPED,
        tenantId: TenantId.parse(TENANT_A_ID),
        isOwner: false,
      }),
    );
    const ids = result.map((r) => r.id);
    expect(ids).toEqual([LOCATION_A1_ID]);
    expect(ids).not.toContain(LOCATION_A2_ID);
    expect(ids).not.toContain(LOCATION_B1_ID);
  });

  it('findPinnableLocations for an owner returns every active tenant location, widened from the deleted per-label scope (F-28)', async () => {
    const result = await runInTenantContext({ tenantId: TENANT_A_ID }, () =>
      reader.findPinnableLocations({
        userId: USER_UNSCOPED,
        tenantId: TenantId.parse(TENANT_A_ID),
        isOwner: true,
      }),
    );
    const ids = result.map((r) => r.id).sort();
    expect(ids).toEqual([LOCATION_A1_ID, LOCATION_A2_ID].sort());
    expect(ids).not.toContain(LOCATION_B1_ID);
  });
});
