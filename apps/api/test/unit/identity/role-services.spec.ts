import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import {
  InsufficientPermissionsToMintError,
  RoleNameReservedError,
  RoleNotFoundError,
  RoleOccupiedError,
} from '../../../src/contexts/identity/domain/errors';
import { CreateRoleService } from '../../../src/contexts/identity/application/create-role.service';
import { UpdateRoleService } from '../../../src/contexts/identity/application/update-role.service';
import { ArchiveRoleService } from '../../../src/contexts/identity/application/archive-role.service';
import { ListRolesService } from '../../../src/contexts/identity/application/list-roles.service';
import type { Auth } from '../../../src/contexts/identity/infrastructure/better-auth/auth.config';

const makeEmitter = () => ({ emit: vi.fn().mockResolvedValue(undefined) });
const makeHeaders = () => new Headers();

const makeRoleApi = (overrides: Record<string, unknown> = {}) => ({
  createOrgRole: vi.fn().mockResolvedValue({ role: 'manager' }),
  updateOrgRole: vi.fn().mockResolvedValue({}),
  deleteOrgRole: vi.fn().mockResolvedValue({}),
  updateMemberRole: vi.fn().mockResolvedValue({}),
  ...overrides,
});

const makeAuth = (roleApi: ReturnType<typeof makeRoleApi>): Auth =>
  ({ api: roleApi }) as unknown as Auth;

const makeRolesDb = (
  rows: { id: string; role: string; permission: Record<string, string[]> }[],
) => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi
          .fn()
          .mockResolvedValue(
            rows.map((r) => ({ id: r.id, role: r.role, permission: JSON.stringify(r.permission) })),
          ),
      }),
    }),
  },
});

describe('CreateRoleService', () => {
  it('throws InsufficientPermissionsToMintError when billing:update in permission — and does NOT call BA', async () => {
    const api = makeRoleApi();
    const svc = new CreateRoleService(makeAuth(api), makeEmitter());
    await expect(
      svc.execute({
        roleName: 'manager',
        permission: { billing: ['update'] },
        tenantId: '00000000-0000-0000-0000-000000000001',
        actorUserId: '00000000-0000-0000-0000-000000000002',
        headers: makeHeaders(),
      }),
    ).rejects.toBeInstanceOf(InsufficientPermissionsToMintError);
    expect(api.createOrgRole).not.toHaveBeenCalled();
  });

  it('throws InsufficientPermissionsToMintError when ac:create in permission', async () => {
    const api = makeRoleApi();
    const svc = new CreateRoleService(makeAuth(api), makeEmitter());
    await expect(
      svc.execute({
        roleName: 'manager',
        permission: { ac: ['create'] },
        tenantId: '00000000-0000-0000-0000-000000000001',
        actorUserId: '00000000-0000-0000-0000-000000000002',
        headers: makeHeaders(),
      }),
    ).rejects.toBeInstanceOf(InsufficientPermissionsToMintError);
    expect(api.createOrgRole).not.toHaveBeenCalled();
  });

  it('throws RoleNameReservedError when roleName normalizes to a system slug', async () => {
    const api = makeRoleApi();
    const svc = new CreateRoleService(makeAuth(api), makeEmitter());
    await expect(
      svc.execute({
        roleName: 'Owner',
        permission: { menu: ['read'] },
        tenantId: '00000000-0000-0000-0000-000000000001',
        actorUserId: '00000000-0000-0000-0000-000000000002',
        headers: makeHeaders(),
      }),
    ).rejects.toBeInstanceOf(RoleNameReservedError);
  });

  it('emits identity.role_created.v1 with actorUserId on success', async () => {
    const api = makeRoleApi();
    const emitter = makeEmitter();
    const svc = new CreateRoleService(makeAuth(api), emitter);
    await svc.execute({
      roleName: 'manager',
      permission: { menu: ['read'] },
      tenantId: '00000000-0000-0000-0000-000000000001',
      actorUserId: '00000000-0000-0000-0000-000000000002',
      headers: makeHeaders(),
    });
    expect(emitter.emit).toHaveBeenCalledOnce();
    const envelope = emitter.emit.mock.calls[0]?.[0] as { payload: { actorUserId: string } };
    expect(envelope.payload.actorUserId).toBe('00000000-0000-0000-0000-000000000002');
  });

  it('calls BA createOrgRole with tenantId from ALS input (never from body)', async () => {
    const api = makeRoleApi();
    const svc = new CreateRoleService(makeAuth(api), makeEmitter());
    await svc.execute({
      roleName: 'cashier',
      permission: { order: ['read'] },
      tenantId: '00000000-0000-0000-0000-000000000001',
      actorUserId: '00000000-0000-0000-0000-000000000002',
      headers: makeHeaders(),
    });
    expect(api.createOrgRole).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          organizationId: '00000000-0000-0000-0000-000000000001',
        }),
      }),
    );
  });
});

describe('UpdateRoleService', () => {
  it('throws InsufficientPermissionsToMintError when new permission includes tenant:delete', async () => {
    const api = makeRoleApi();
    const authDb = makeRolesDb([{ id: 'r1', role: 'cashier', permission: { menu: ['read'] } }]);
    const svc = new UpdateRoleService(makeAuth(api), authDb as never, makeEmitter());
    await expect(
      svc.execute({
        roleSlug: 'cashier',
        permission: { tenant: ['delete'] },
        tenantId: '00000000-0000-0000-0000-000000000001',
        actorUserId: '00000000-0000-0000-0000-000000000002',
        headers: makeHeaders(),
      }),
    ).rejects.toBeInstanceOf(InsufficientPermissionsToMintError);
    expect(api.updateOrgRole).not.toHaveBeenCalled();
  });

  it('throws RoleNotFoundError when the role slug does not exist in the list', async () => {
    const api = makeRoleApi();
    const authDb = makeRolesDb([]);
    const svc = new UpdateRoleService(makeAuth(api), authDb as never, makeEmitter());
    await expect(
      svc.execute({
        roleSlug: 'nonexistent',
        permission: { menu: ['read'] },
        tenantId: '00000000-0000-0000-0000-000000000001',
        actorUserId: '00000000-0000-0000-0000-000000000002',
        headers: makeHeaders(),
      }),
    ).rejects.toBeInstanceOf(RoleNotFoundError);
  });

  it('emits role_permissions_changed.v1 with previousPermission and newPermission', async () => {
    const api = makeRoleApi();
    const authDb = makeRolesDb([{ id: 'r1', role: 'cashier', permission: { menu: ['read'] } }]);
    const emitter = makeEmitter();
    const svc = new UpdateRoleService(makeAuth(api), authDb as never, emitter);
    await svc.execute({
      roleSlug: 'cashier',
      permission: { order: ['read'] },
      tenantId: '00000000-0000-0000-0000-000000000001',
      actorUserId: '00000000-0000-0000-0000-000000000002',
      headers: makeHeaders(),
    });
    expect(emitter.emit).toHaveBeenCalledOnce();
    const envelope = emitter.emit.mock.calls[0]?.[0] as {
      payload: { previousPermission: unknown; newPermission: unknown };
    };
    expect(envelope.payload.previousPermission).toEqual({ menu: ['read'] });
    expect(envelope.payload.newPermission).toEqual({ order: ['read'] });
  });
});

describe('ArchiveRoleService', () => {
  const makeAuthDrizzle = (
    members: { id: string; role: string }[],
    activeRoleSlugs: string[] = ['cashier'],
  ) => {
    const roleRows = activeRoleSlugs.map((slug, i) => ({
      id: `role-${i}`,
      role: slug,
      permission: JSON.stringify({ menu: ['read'] }),
    }));
    const whereMock = vi.fn().mockResolvedValueOnce(roleRows).mockResolvedValueOnce(members);
    return {
      db: {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({ where: whereMock }),
        }),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
      },
    };
  };

  it('throws RoleOccupiedError when members hold the role — never issues UPDATE', async () => {
    const authDb = makeAuthDrizzle([
      { id: 'm0', role: 'cashier' },
      { id: 'm1', role: 'cashier' },
    ]);
    const emitter = makeEmitter();
    const svc = new ArchiveRoleService(authDb as never, emitter);
    await expect(
      svc.execute({
        roleSlug: 'cashier',
        tenantId: '00000000-0000-0000-0000-000000000001',
        actorUserId: '00000000-0000-0000-0000-000000000002',
        headers: makeHeaders(),
      }),
    ).rejects.toBeInstanceOf(RoleOccupiedError);
    expect(authDb.db.update).not.toHaveBeenCalled();
  });

  it('never calls deleteOrgRole (BA hard-delete) — uses UPDATE archived_at instead', async () => {
    const authDb = makeAuthDrizzle([]);
    const emitter = makeEmitter();
    const api = makeRoleApi();
    const svc = new ArchiveRoleService(authDb as never, emitter);
    await svc.execute({
      roleSlug: 'cashier',
      tenantId: '00000000-0000-0000-0000-000000000001',
      actorUserId: '00000000-0000-0000-0000-000000000002',
      headers: makeHeaders(),
    });
    expect(api.deleteOrgRole).not.toHaveBeenCalled();
  });

  it('issues archived_at UPDATE and emits role_deleted.v1 when member count is 0', async () => {
    const authDb = makeAuthDrizzle([]);
    const emitter = makeEmitter();
    const svc = new ArchiveRoleService(authDb as never, emitter);
    await svc.execute({
      roleSlug: 'cashier',
      tenantId: '00000000-0000-0000-0000-000000000001',
      actorUserId: '00000000-0000-0000-0000-000000000002',
      headers: makeHeaders(),
    });
    expect(authDb.db.update).toHaveBeenCalledOnce();
    expect(emitter.emit).toHaveBeenCalledOnce();
  });

  it('throws RoleNotFoundError for a slug that is not an active custom role — no UPDATE, no event', async () => {
    const authDb = makeAuthDrizzle([], []);
    const emitter = makeEmitter();
    const svc = new ArchiveRoleService(authDb as never, emitter);
    await expect(
      svc.execute({
        roleSlug: 'ghost',
        tenantId: '00000000-0000-0000-0000-000000000001',
        actorUserId: '00000000-0000-0000-0000-000000000002',
        headers: makeHeaders(),
      }),
    ).rejects.toBeInstanceOf(RoleNotFoundError);
    expect(authDb.db.update).not.toHaveBeenCalled();
    expect(emitter.emit).not.toHaveBeenCalled();
  });
});

describe('ListRolesService', () => {
  it('maps tenant_role rows to RoleView with JSON-parsed permission', async () => {
    const authDb = makeRolesDb([{ id: 'r1', role: 'cashier', permission: { menu: ['read'] } }]);
    const svc = new ListRolesService(authDb as never);
    const result = await svc.execute({
      tenantId: '00000000-0000-0000-0000-000000000001',
      headers: makeHeaders(),
    });
    expect(result.roles).toHaveLength(1);
    expect(result.roles[0]).toEqual({ id: 'r1', role: 'cashier', permission: { menu: ['read'] } });
  });

  it('returns every active role the query yields', async () => {
    const authDb = makeRolesDb([
      { id: 'r1', role: 'cashier', permission: { menu: ['read'] } },
      { id: 'r2', role: 'manager', permission: { order: ['read'] } },
    ]);
    const svc = new ListRolesService(authDb as never);
    const result = await svc.execute({
      tenantId: '00000000-0000-0000-0000-000000000001',
      headers: makeHeaders(),
    });
    expect(result.roles).toHaveLength(2);
  });
});
