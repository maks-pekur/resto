import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import {
  AssignmentExceedsAuthorityError,
  InsufficientPermissionsToMintError,
  RoleNotFoundError,
  SelfRoleAssignmentError,
} from '../../../src/contexts/identity/domain/errors';
import { AssignRoleService } from '../../../src/contexts/identity/application/assign-role.service';
import {
  computeEffectivePermissions,
  isSubsetOf,
} from '../../../src/contexts/identity/application/effective-permissions';
import type { Auth } from '../../../src/contexts/identity/infrastructure/better-auth/auth.config';

const ORG_ID = '00000000-0000-0000-0000-000000000001';
const ACTOR_USER_ID = '00000000-0000-0000-0000-000000000002';
const ACTOR_MEMBER_ID = 'member-actor';
const TARGET_MEMBER_ID = 'member-target';

const makeHeaders = () => new Headers();

const makeRoleApi = (overrides: Record<string, unknown> = {}) => ({
  createOrgRole: vi.fn(),
  updateOrgRole: vi.fn(),
  deleteOrgRole: vi.fn(),
  updateMemberRole: vi.fn().mockResolvedValue({}),
  ...overrides,
});

const makeAuth = (roleApi: ReturnType<typeof makeRoleApi>): Auth =>
  ({ api: roleApi }) as unknown as Auth;

// where() serves both the member lookup (.limit(1)) and the direct roles query
// (awaited via .then) that listActiveCustomRoles issues against organization_role.
const makeAuthDb = (
  actorMember: { id: string; role: string } | null,
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
            limit: vi.fn().mockResolvedValue(actorMember ? [actorMember] : []),
            then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
              Promise.resolve(roleResult).then(onFulfilled, onRejected),
          }),
        }),
      }),
    },
  };
};

describe('isSubsetOf', () => {
  it('returns true when target is a subset of actor effective set', () => {
    const target = { menu: ['read'] };
    const actorEffective = { menu: ['read', 'update'], order: ['read'] };
    expect(isSubsetOf(target, actorEffective)).toBe(true);
  });

  it('returns false when target has an action actor lacks', () => {
    const target = { menu: ['delete'] };
    const actorEffective = { menu: ['read'] };
    expect(isSubsetOf(target, actorEffective)).toBe(false);
  });

  it('returns false when target has a resource actor lacks entirely', () => {
    const target = { reports: ['read'] };
    const actorEffective = { menu: ['read'] };
    expect(isSubsetOf(target, actorEffective)).toBe(false);
  });

  it('returns true for empty target', () => {
    expect(isSubsetOf({}, { menu: ['read'] })).toBe(true);
  });
});

describe('computeEffectivePermissions', () => {
  it('returns owner full set for owner system role', () => {
    const effective = computeEffectivePermissions('owner', () => null);
    expect(effective.ac).toContain('create');
    expect(effective.menu).toContain('delete');
  });

  it('merges system role and custom role permissions', () => {
    const lookup = (slug: string) => (slug === 'custom-gm' ? { reports: ['read'] } : null);
    const effective = computeEffectivePermissions('staff,custom-gm', lookup);
    expect(effective.brand).toContain('read');
    expect(effective.reports).toContain('read');
  });

  it('returns empty set for unknown slug with no custom lookup match', () => {
    const effective = computeEffectivePermissions('custom-unknown', () => null);
    expect(Object.keys(effective)).toHaveLength(0);
  });
});

describe('AssignRoleService', () => {
  it('throws RoleNotFoundError when roleSlug is a system role slug (owner)', async () => {
    const api = makeRoleApi();
    const authDb = makeAuthDb({ id: ACTOR_MEMBER_ID, role: 'owner' });
    const svc = new AssignRoleService(makeAuth(api), authDb as never);
    await expect(
      svc.execute({
        organizationId: ORG_ID,
        actorUserId: ACTOR_USER_ID,
        targetMemberId: TARGET_MEMBER_ID,
        roleSlug: 'owner',
        headers: makeHeaders(),
      }),
    ).rejects.toBeInstanceOf(RoleNotFoundError);
    expect(api.updateMemberRole).not.toHaveBeenCalled();
  });

  it('throws RoleNotFoundError when roleSlug is a system role slug (staff)', async () => {
    const api = makeRoleApi();
    const authDb = makeAuthDb({ id: ACTOR_MEMBER_ID, role: 'owner' });
    const svc = new AssignRoleService(makeAuth(api), authDb as never);
    await expect(
      svc.execute({
        organizationId: ORG_ID,
        actorUserId: ACTOR_USER_ID,
        targetMemberId: TARGET_MEMBER_ID,
        roleSlug: 'staff',
        headers: makeHeaders(),
      }),
    ).rejects.toBeInstanceOf(RoleNotFoundError);
    expect(api.updateMemberRole).not.toHaveBeenCalled();
  });

  it('throws SelfRoleAssignmentError when actor assigns to their own memberId', async () => {
    const api = makeRoleApi();
    const authDb = makeAuthDb({ id: ACTOR_MEMBER_ID, role: 'owner' }, [
      { id: 'r1', role: 'cashier', permission: { menu: ['read'] } },
    ]);
    const svc = new AssignRoleService(makeAuth(api), authDb as never);
    await expect(
      svc.execute({
        organizationId: ORG_ID,
        actorUserId: ACTOR_USER_ID,
        targetMemberId: ACTOR_MEMBER_ID,
        roleSlug: 'cashier',
        headers: makeHeaders(),
      }),
    ).rejects.toBeInstanceOf(SelfRoleAssignmentError);
    expect(api.updateMemberRole).not.toHaveBeenCalled();
  });

  it('throws RoleNotFoundError when target role slug does not exist', async () => {
    const api = makeRoleApi();
    const authDb = makeAuthDb({ id: ACTOR_MEMBER_ID, role: 'owner' }, []);
    const svc = new AssignRoleService(makeAuth(api), authDb as never);
    await expect(
      svc.execute({
        organizationId: ORG_ID,
        actorUserId: ACTOR_USER_ID,
        targetMemberId: TARGET_MEMBER_ID,
        roleSlug: 'nonexistent',
        headers: makeHeaders(),
      }),
    ).rejects.toBeInstanceOf(RoleNotFoundError);
    expect(api.updateMemberRole).not.toHaveBeenCalled();
  });

  it('throws RoleNotFoundError when target role is archived', async () => {
    const api = makeRoleApi();
    const authDb = makeAuthDb({ id: ACTOR_MEMBER_ID, role: 'owner' }, []);
    const svc = new AssignRoleService(makeAuth(api), authDb as never);
    await expect(
      svc.execute({
        organizationId: ORG_ID,
        actorUserId: ACTOR_USER_ID,
        targetMemberId: TARGET_MEMBER_ID,
        roleSlug: 'cashier',
        headers: makeHeaders(),
      }),
    ).rejects.toBeInstanceOf(RoleNotFoundError);
    expect(api.updateMemberRole).not.toHaveBeenCalled();
  });

  it('throws InsufficientPermissionsToMintError when target role has billing:update (NON_DELEGATABLE)', async () => {
    const api = makeRoleApi();
    const authDb = makeAuthDb({ id: ACTOR_MEMBER_ID, role: 'owner' }, [
      { id: 'r1', role: 'cashier', permission: { billing: ['update'] } },
    ]);
    const svc = new AssignRoleService(makeAuth(api), authDb as never);
    await expect(
      svc.execute({
        organizationId: ORG_ID,
        actorUserId: ACTOR_USER_ID,
        targetMemberId: TARGET_MEMBER_ID,
        roleSlug: 'cashier',
        headers: makeHeaders(),
      }),
    ).rejects.toBeInstanceOf(InsufficientPermissionsToMintError);
    expect(api.updateMemberRole).not.toHaveBeenCalled();
  });

  it('throws AssignmentExceedsAuthorityError when target role has menu:delete and actor lacks it', async () => {
    const api = makeRoleApi();
    const authDb = makeAuthDb({ id: ACTOR_MEMBER_ID, role: 'staff' }, [
      { id: 'r1', role: 'super-cashier', permission: { menu: ['delete'] } },
    ]);
    const svc = new AssignRoleService(makeAuth(api), authDb as never);
    await expect(
      svc.execute({
        organizationId: ORG_ID,
        actorUserId: ACTOR_USER_ID,
        targetMemberId: TARGET_MEMBER_ID,
        roleSlug: 'super-cashier',
        headers: makeHeaders(),
      }),
    ).rejects.toBeInstanceOf(AssignmentExceedsAuthorityError);
    expect(api.updateMemberRole).not.toHaveBeenCalled();
  });

  it('calls updateMemberRole exactly once with ALS organizationId on valid assignment', async () => {
    const api = makeRoleApi();
    const authDb = makeAuthDb({ id: ACTOR_MEMBER_ID, role: 'owner' }, [
      { id: 'r1', role: 'cashier', permission: { menu: ['read'] } },
    ]);
    const svc = new AssignRoleService(makeAuth(api), authDb as never);
    await svc.execute({
      organizationId: ORG_ID,
      actorUserId: ACTOR_USER_ID,
      targetMemberId: TARGET_MEMBER_ID,
      roleSlug: 'cashier',
      headers: makeHeaders(),
    });
    expect(api.updateMemberRole).toHaveBeenCalledOnce();
    expect(api.updateMemberRole).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ organizationId: ORG_ID }),
      }),
    );
  });
});
