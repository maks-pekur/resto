import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { schema } from '@resto/db';
import type { TenantAwareDb } from '@resto/db';
import {
  InsufficientPermissionsToMintError,
  RoleNotFoundError,
} from '../../../src/contexts/identity/domain/errors';
import { AssignLocationRoleService } from '../../../src/contexts/identity/application/assign-location-role.service';
import type { AuthDrizzle } from '../../../src/contexts/identity/infrastructure/better-auth/auth-db';

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const MEMBER_ID = 'member-target';
const LOCATION_ID = '00000000-0000-0000-0000-000000000002';

const makeAuthDb = (
  roleRows: { id: string; role: string; permission: Record<string, string[]> }[] = [],
) => {
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

const makeTenantAwareDb = () => {
  const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
  const insertInto = vi.fn().mockReturnValue({ onConflictDoUpdate });
  const withTenant = vi.fn(
    (op: (tx: unknown, scoped: { insertInto: typeof insertInto }) => Promise<unknown>) =>
      op({}, { insertInto }),
  );
  return {
    db: { withTenant } as unknown as TenantAwareDb,
    insertInto,
    onConflictDoUpdate,
  };
};

describe('AssignLocationRoleService', () => {
  it('throws InsufficientPermissionsToMintError when the target custom role has a NON_DELEGATABLE permission', async () => {
    const authDb = makeAuthDb([
      { id: 'r1', role: 'super-manager', permission: { billing: ['update'] } },
    ]);
    const { db, insertInto } = makeTenantAwareDb();
    const svc = new AssignLocationRoleService(authDb, db);
    await expect(
      svc.execute({
        tenantId: TENANT_ID,
        memberId: MEMBER_ID,
        locationId: LOCATION_ID,
        roleSlug: 'super-manager',
      }),
    ).rejects.toBeInstanceOf(InsufficientPermissionsToMintError);
    expect(insertInto).not.toHaveBeenCalled();
  });

  it('throws RoleNotFoundError when the target custom role slug does not exist', async () => {
    const authDb = makeAuthDb([]);
    const { db, insertInto } = makeTenantAwareDb();
    const svc = new AssignLocationRoleService(authDb, db);
    await expect(
      svc.execute({
        tenantId: TENANT_ID,
        memberId: MEMBER_ID,
        locationId: LOCATION_ID,
        roleSlug: 'nonexistent',
      }),
    ).rejects.toBeInstanceOf(RoleNotFoundError);
    expect(insertInto).not.toHaveBeenCalled();
  });

  it('permits a system role slug (owner) — D-06, no SYSTEM_ROLE_SLUGS rejection', async () => {
    const authDb = makeAuthDb([]);
    const { db, insertInto, onConflictDoUpdate } = makeTenantAwareDb();
    const svc = new AssignLocationRoleService(authDb, db);
    await svc.execute({
      tenantId: TENANT_ID,
      memberId: MEMBER_ID,
      locationId: LOCATION_ID,
      roleSlug: 'owner',
    });
    expect(insertInto).toHaveBeenCalledWith(
      schema.memberLocationScope,
      expect.objectContaining({ memberId: MEMBER_ID, locationId: LOCATION_ID, role: 'owner' }),
    );
    expect(onConflictDoUpdate).toHaveBeenCalledOnce();
  });

  it('upserts member_location_scope.role for a valid custom role slug', async () => {
    const authDb = makeAuthDb([{ id: 'r1', role: 'cashier', permission: { menu: ['read'] } }]);
    const { db, insertInto, onConflictDoUpdate } = makeTenantAwareDb();
    const svc = new AssignLocationRoleService(authDb, db);
    await svc.execute({
      tenantId: TENANT_ID,
      memberId: MEMBER_ID,
      locationId: LOCATION_ID,
      roleSlug: 'cashier',
    });
    expect(insertInto).toHaveBeenCalledWith(
      schema.memberLocationScope,
      expect.objectContaining({ role: 'cashier' }),
    );
    expect(onConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        target: [schema.memberLocationScope.memberId, schema.memberLocationScope.locationId],
        set: expect.objectContaining({ role: 'cashier' }),
      }),
    );
  });

  it('nulls the row role when roleSlug is null (clearing an assignment)', async () => {
    const authDb = makeAuthDb([]);
    const { db, insertInto, onConflictDoUpdate } = makeTenantAwareDb();
    const svc = new AssignLocationRoleService(authDb, db);
    await svc.execute({
      tenantId: TENANT_ID,
      memberId: MEMBER_ID,
      locationId: LOCATION_ID,
      roleSlug: null,
    });
    expect(insertInto).toHaveBeenCalledWith(
      schema.memberLocationScope,
      expect.objectContaining({ role: null }),
    );
    expect(onConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ set: expect.objectContaining({ role: null }) }),
    );
  });
});
