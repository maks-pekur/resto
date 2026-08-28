import 'reflect-metadata';
import { APIError } from 'better-auth/api';
import { describe, expect, it, vi } from 'vitest';
import { SYSTEM_ROLES } from '@resto/domain';
import { assertRoleAssignable } from '../../../src/contexts/identity/infrastructure/better-auth/role-assignability';
import type { AuthDrizzle } from '../../../src/contexts/identity/infrastructure/better-auth/auth-db';

const TENANT_ID = '00000000-0000-0000-0000-000000000001';

/**
 * This spec used to carry an inline REPLICA of the hook, commented "mirrors the
 * production implementation exactly". It did not: its `SYSTEM_ROLES.admin` was
 * `{ menu: ['read'] }` while production's carries `staff: ['remove']`. The replica
 * therefore certified that `admin` is assignable while production refused it, and
 * stayed green from 2026-07-04 until the 2026-08-28 e2e audit found the defect.
 *
 * It now exercises the real `assertRoleAssignable`. Do not reintroduce a copy.
 */
const makeAuthDb = (permissionJson: string | null): AuthDrizzle =>
  ({
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
  }) as unknown as AuthDrizzle;

const run = (newRole: string, authDb: AuthDrizzle): Promise<void> =>
  assertRoleAssignable({ newRole, orgId: TENANT_ID, authDb });

describe('assertRoleAssignable (beforeUpdateMemberRole backstop)', () => {
  it('refuses a custom role carrying billing:update (NON_DELEGATABLE)', async () => {
    await expect(
      run('cashier', makeAuthDb(JSON.stringify({ billing: ['update'] }))),
    ).rejects.toBeInstanceOf(APIError);
  });

  it('refuses a custom role carrying ac:create (NON_DELEGATABLE)', async () => {
    await expect(
      run('super-role', makeAuthDb(JSON.stringify({ ac: ['create'] }))),
    ).rejects.toBeInstanceOf(APIError);
  });

  it('refuses with code role.insufficient_permissions', async () => {
    await expect(
      run('cashier', makeAuthDb(JSON.stringify({ billing: ['update'] }))),
    ).rejects.toMatchObject({
      body: { code: 'role.insufficient_permissions' },
    });
  });

  it('refuses as 403, not 500 — the throw must be BA-native so better-call maps it', async () => {
    // Regression gate for the 2026-08-28 audit finding. A NestJS ForbiddenException
    // here is an unhandled throw inside better-call: it becomes a 500 and
    // ProblemDetailsFilter then redacts the reason (RES-175).
    await expect(
      run('cashier', makeAuthDb(JSON.stringify({ billing: ['update'] }))),
    ).rejects.toMatchObject({
      status: 'FORBIDDEN',
    });
  });

  it('allows a delegatable custom role', async () => {
    await expect(
      run('manager', makeAuthDb(JSON.stringify({ menu: ['read', 'update'], order: ['read'] }))),
    ).resolves.toBeUndefined();
  });

  it('refuses an unknown or archived role slug (fail closed, T-083-17)', async () => {
    await expect(run('unknown-slug', makeAuthDb(null))).rejects.toBeInstanceOf(APIError);
  });

  it('uses the REAL SYSTEM_ROLES — admin is currently unassignable', async () => {
    // The drift the old replica hid. SYSTEM_ROLES.admin carries staff:['remove'],
    // which NON_DELEGATABLE forbids, so the built-in admin role cannot be granted.
    // This is a live product defect awaiting a founder decision
    // (.planning/todos/pending/admin-role-cannot-be-assigned.md) — this assertion
    // documents the real behaviour so the next change to SYSTEM_ROLES.admin is
    // deliberate. When the decision lands, update this expectation with it.
    expect(SYSTEM_ROLES.admin).toMatchObject({ staff: expect.arrayContaining(['remove']) });
    await expect(run('admin', makeAuthDb(null))).rejects.toBeInstanceOf(APIError);
  });

  it('allows the built-in staff role', async () => {
    await expect(run('staff', makeAuthDb(null))).resolves.toBeUndefined();
  });
});
