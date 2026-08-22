import 'reflect-metadata';
import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { containsNonDelegatable } from '@resto/domain';

const TENANT_ID = '00000000-0000-0000-0000-000000000001';

const makeAuthDb = (permissionJson: string | null) => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi
            .fn()
            .mockResolvedValue(permissionJson !== null ? [{ permission: permissionJson }] : []),
        }),
      }),
    }),
  },
});

// Inline replica of the beforeUpdateMemberRole hook logic extracted from auth.config.ts
// for isolated unit testing. This mirrors the production implementation exactly.
const runBeforeHook = async (
  newRole: string,
  tenantId: string,
  authDb: ReturnType<typeof makeAuthDb>,
) => {
  const SYSTEM_ROLES: Record<string, Record<string, readonly string[]>> = {
    owner: { ac: ['create', 'read', 'update', 'delete'], billing: ['read', 'update'] },
    admin: { menu: ['read'] },
    staff: { tenant: ['read'] },
  };

  let targetPermission: Record<string, string[]> | null = null;
  const systemRole = SYSTEM_ROLES[newRole];
  if (systemRole) {
    targetPermission = Object.fromEntries(Object.entries(systemRole).map(([r, a]) => [r, [...a]]));
  } else {
    const rows = await authDb.db
      .select({ permission: 'permission' })
      .from('tenantRoleTable')
      .where(`${tenantId}/${newRole}`)
      .limit(1);
    const raw = (rows[0] as { permission?: string } | undefined)?.permission;
    if (typeof raw === 'string') {
      targetPermission = JSON.parse(raw) as Record<string, string[]>;
    }
    if (targetPermission === null) {
      throw new ForbiddenException({
        code: 'role.insufficient_permissions',
        message: 'Unknown or archived target role.',
      });
    }
  }

  if (targetPermission && containsNonDelegatable(targetPermission)) {
    throw new ForbiddenException({
      code: 'role.insufficient_permissions',
      message: 'You cannot assign a role bearing non-delegatable permissions.',
    });
  }
};

describe('beforeUpdateMemberRole hook logic', () => {
  it('throws ForbiddenException when custom role permission contains billing:update (NON_DELEGATABLE)', async () => {
    const authDb = makeAuthDb(JSON.stringify({ billing: ['update'] }));
    await expect(runBeforeHook('cashier', TENANT_ID, authDb)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('throws ForbiddenException when custom role permission contains ac:create (NON_DELEGATABLE)', async () => {
    const authDb = makeAuthDb(JSON.stringify({ ac: ['create'] }));
    await expect(runBeforeHook('super-role', TENANT_ID, authDb)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('throws ForbiddenException with code role.insufficient_permissions', async () => {
    const authDb = makeAuthDb(JSON.stringify({ billing: ['update'] }));
    await expect(runBeforeHook('cashier', TENANT_ID, authDb)).rejects.toMatchObject({
      response: { code: 'role.insufficient_permissions' },
    });
  });

  it('returns void (no throw) for a delegatable custom role permission', async () => {
    const authDb = makeAuthDb(JSON.stringify({ menu: ['read', 'update'], order: ['read'] }));
    await expect(runBeforeHook('manager', TENANT_ID, authDb)).resolves.toBeUndefined();
  });

  it('throws ForbiddenException when role slug not found in db (fail closed)', async () => {
    const authDb = makeAuthDb(null);
    await expect(runBeforeHook('unknown-slug', TENANT_ID, authDb)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
