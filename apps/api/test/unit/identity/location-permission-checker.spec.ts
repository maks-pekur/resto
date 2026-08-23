import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { LocationPermissionChecker } from '../../../src/contexts/identity/application/location-scope/location-permission-checker';
import type { MemberLocationScopeReader } from '../../../src/contexts/identity/application/ports/member-location-scope-reader.port';
import type { OperatorPrincipal } from '../../../src/contexts/identity/domain/principal';
import type { AuthDrizzle } from '../../../src/contexts/identity/infrastructure/better-auth/auth-db';

const ORG_ID = '00000000-0000-0000-0000-000000000001';
const LOCATION_ID = '00000000-0000-0000-0000-000000000002';

const makeReader = (roleSlug: string | null): MemberLocationScopeReader => ({
  findLocationScopeForMember: vi.fn(),
  findRoleForMemberAtLocation: vi.fn().mockResolvedValue(roleSlug),
  findPinnableLocations: vi.fn(),
  listLocationRolesForMember: vi.fn(),
});

const makeAuthDb = (
  roleRows: { id: string; role: string; permission: Record<string, string[]> }[] = [],
): AuthDrizzle => {
  const roleResult = roleRows.map((r) => ({
    id: r.id,
    role: r.role,
    permission: JSON.stringify(r.permission),
  }));
  return {
    db: {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
              Promise.resolve(roleResult).then(onFulfilled, onRejected),
          }),
        }),
      }),
    },
  } as unknown as AuthDrizzle;
};

const makeOperator = (baseRole: 'owner' | 'admin' | 'staff'): OperatorPrincipal => ({
  kind: 'operator',
  userId: 'user-1',
  email: 'op@example.com',
  tenantId: ORG_ID,
  baseRole,
});

describe('LocationPermissionChecker', () => {
  it('returns true for an owner principal without consulting member_location_scope', async () => {
    const reader = makeReader(null);
    const checker = new LocationPermissionChecker(reader, makeAuthDb());
    const allowed = await checker.hasPermission(
      makeOperator('owner'),
      { menu: ['update'] },
      undefined,
      LOCATION_ID,
    );
    expect(allowed).toBe(true);
    expect(reader.findRoleForMemberAtLocation).not.toHaveBeenCalled();
  });

  it('returns true for a non-owner whose active-location role includes the required permission', async () => {
    const reader = makeReader('staff');
    const checker = new LocationPermissionChecker(reader, makeAuthDb());
    const allowed = await checker.hasPermission(
      makeOperator('staff'),
      { location: ['read'] },
      undefined,
      LOCATION_ID,
    );
    expect(allowed).toBe(true);
    expect(reader.findRoleForMemberAtLocation).toHaveBeenCalledWith({
      userId: 'user-1',
      locationId: LOCATION_ID,
    });
  });

  it('returns false for a non-owner whose active-location role does NOT include the required permission (over-grant prevented)', async () => {
    const reader = makeReader('staff');
    const checker = new LocationPermissionChecker(reader, makeAuthDb());
    const allowed = await checker.hasPermission(
      makeOperator('staff'),
      { location: ['delete'] },
      undefined,
      LOCATION_ID,
    );
    expect(allowed).toBe(false);
  });

  it('falls back to the tenant base role when there is no activeLocationId', async () => {
    const reader = makeReader('manager');
    const checker = new LocationPermissionChecker(reader, makeAuthDb());

    // `staff` grants location:read tenant-wide, so this passes without any location...
    expect(
      await checker.hasPermission(makeOperator('staff'), { location: ['read'] }, undefined, null),
    ).toBe(true);
    // ...but nothing the location role would have added is reachable.
    expect(
      await checker.hasPermission(makeOperator('staff'), { order: ['cancel'] }, undefined, null),
    ).toBe(false);
    expect(reader.findRoleForMemberAtLocation).not.toHaveBeenCalled();
  });

  it('falls back to the tenant base role when the member has no role at the location', async () => {
    const reader = makeReader(null);
    const checker = new LocationPermissionChecker(reader, makeAuthDb());

    expect(
      await checker.hasPermission(
        makeOperator('staff'),
        { location: ['read'] },
        undefined,
        LOCATION_ID,
      ),
    ).toBe(true);
    expect(
      await checker.hasPermission(
        makeOperator('staff'),
        { order: ['cancel'] },
        undefined,
        LOCATION_ID,
      ),
    ).toBe(false);
  });

  it('unions the tenant base role with the role held at the active location', async () => {
    const reader = makeReader('manager');
    // `manager` is a preset role, so its permissions come from tenant_role, not SYSTEM_ROLES.
    const checker = new LocationPermissionChecker(
      reader,
      makeAuthDb([
        {
          id: 'role-1',
          role: 'manager',
          permission: { order: ['read', 'update-status', 'cancel'], menu: ['read'] },
        },
      ]),
    );
    const staffOperator = makeOperator('staff');

    // from `staff`
    expect(
      await checker.hasPermission(staffOperator, { location: ['read'] }, undefined, LOCATION_ID),
    ).toBe(true);
    // from the `manager` preset held at this location
    expect(
      await checker.hasPermission(staffOperator, { order: ['cancel'] }, undefined, LOCATION_ID),
    ).toBe(true);
    // neither grants it — the union must not become a blank cheque
    expect(
      await checker.hasPermission(staffOperator, { billing: ['update'] }, undefined, LOCATION_ID),
    ).toBe(false);
  });

  // Regression (08.4-07 follow-up): picking a location goes through
  // POST /v1/me/set-active-location, itself gated on `tenant: ['read']`. A location-only checker
  // denies that call, so a member with no location can never acquire one — every non-owner locked
  // out. This is what kept the checker unwired for months.
  it('does not deadlock the set-active-location bootstrap', async () => {
    const reader = makeReader(null);
    const checker = new LocationPermissionChecker(reader, makeAuthDb());
    expect(
      await checker.hasPermission(makeOperator('staff'), { tenant: ['read'] }, undefined, null),
    ).toBe(true);
  });

  it('denies a non-owner carrying no base role and no location role', async () => {
    const reader = makeReader(null);
    const checker = new LocationPermissionChecker(reader, makeAuthDb());
    // exactOptionalPropertyTypes: omit the key rather than assigning undefined.
    const { baseRole: _omitted, ...roleless } = makeOperator('staff');
    expect(
      await checker.hasPermission(roleless, { tenant: ['read'] }, undefined, LOCATION_ID),
    ).toBe(false);
  });
});
