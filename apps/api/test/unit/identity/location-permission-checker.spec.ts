import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { LocationPermissionChecker } from '../../../src/contexts/identity/application/location-permission-checker';
import type { MemberLocationScopeReader } from '../../../src/contexts/identity/application/ports/member-location-scope-reader.port';
import type { OperatorPrincipal } from '../../../src/contexts/identity/domain/principal';
import type { AuthDrizzle } from '../../../src/contexts/identity/infrastructure/better-auth/auth-db';

const ORG_ID = '00000000-0000-0000-0000-000000000001';
const LOCATION_ID = '00000000-0000-0000-0000-000000000002';

const makeReader = (roleSlug: string | null): MemberLocationScopeReader => ({
  findLocationScopeForMember: vi.fn(),
  findReachableBrandsForMember: vi.fn(),
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

  it('returns false for a non-owner with no activeLocationId', async () => {
    const reader = makeReader('staff');
    const checker = new LocationPermissionChecker(reader, makeAuthDb());
    const allowed = await checker.hasPermission(
      makeOperator('staff'),
      { location: ['read'] },
      undefined,
      null,
    );
    expect(allowed).toBe(false);
    expect(reader.findRoleForMemberAtLocation).not.toHaveBeenCalled();
  });

  it('returns false for a non-owner with no role at the location', async () => {
    const reader = makeReader(null);
    const checker = new LocationPermissionChecker(reader, makeAuthDb());
    const allowed = await checker.hasPermission(
      makeOperator('staff'),
      { location: ['read'] },
      undefined,
      LOCATION_ID,
    );
    expect(allowed).toBe(false);
  });
});
