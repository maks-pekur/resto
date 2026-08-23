import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { MeController } from './me.controller';
import type {
  OperatorPrincipal,
  CustomerPrincipal,
  AnonymousPrincipal,
} from '../../domain/principal';
import type { FastifyRequest } from 'fastify';
import type { AuthDrizzle } from '../../infrastructure/better-auth/auth-db';
import type { MemberLocationScopeReader } from '../../application/ports/member-location-scope-reader.port';

const ORG_ID = '00000000-0000-0000-0000-000000000001';
const LOCATION_ID = '00000000-0000-0000-0000-000000000002';

const makeScopeReader = (locationRole: string | null = null) =>
  ({
    findRoleForMemberAtLocation: vi.fn().mockResolvedValue(locationRole),
    findLocationScopeForMember: vi.fn(),
    findPinnableLocations: vi.fn(),
    listLocationRolesForMember: vi.fn(),
  }) as unknown as MemberLocationScopeReader;

/** AuthGuard puts the session's active location here; `/v1/me` unions it into the answer. */
const makeReq = (activeLocationId: string | null = null) =>
  ({ activeLocationId }) as unknown as FastifyRequest;

const makeAuthDb = (
  customRoles: { id: string; role: string; permission: Record<string, string[]> }[] = [],
): AuthDrizzle => {
  const customRoleRows = customRoles.map((r) => ({
    id: r.id,
    role: r.role,
    permission: JSON.stringify(r.permission),
  }));

  const roleChain = {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
          Promise.resolve(customRoleRows).then(onFulfilled, onRejected),
      }),
    }),
  };

  const select = vi.fn().mockReturnValue(roleChain);

  return { db: { select } } as unknown as AuthDrizzle;
};

const makeOwner = (): OperatorPrincipal => ({
  kind: 'operator',
  userId: 'user-owner',
  email: 'owner@example.com',
  tenantId: ORG_ID,
  baseRole: 'owner',
});

const makeCashierFoh = (): OperatorPrincipal => ({
  kind: 'operator',
  userId: 'user-cashier',
  email: 'cashier@example.com',
  tenantId: ORG_ID,
  baseRole: 'staff',
});

const makeBareStaff = (): OperatorPrincipal => ({
  kind: 'operator',
  userId: 'user-staff',
  email: 'staff@example.com',
  tenantId: ORG_ID,
  baseRole: 'staff',
});

describe('MeController', () => {
  it('returns operator projection with baseRole when present', async () => {
    const authDb = makeAuthDb();
    const controller = new MeController(authDb, makeScopeReader());
    const result = await controller.me(makeOwner(), makeReq());
    expect(result).toMatchObject({
      kind: 'operator',
      userId: 'user-owner',
      email: 'owner@example.com',
      tenantId: ORG_ID,
      baseRole: 'owner',
    });
  });

  it('omits baseRole when absent', async () => {
    const authDb = makeAuthDb();
    const controller = new MeController(authDb, makeScopeReader());
    const operatorNoRole: OperatorPrincipal = {
      kind: 'operator',
      userId: 'user-fresh-2',
      email: 'fresh2@example.com',
    };
    const result = await controller.me(operatorNoRole, makeReq());
    expect(result).toEqual({
      kind: 'operator',
      userId: 'user-fresh-2',
      email: 'fresh2@example.com',
      permissions: {},
    });
  });

  it("an owner's response includes billing: ['read','update'] and no permissions call errors", async () => {
    const authDb = makeAuthDb();
    const controller = new MeController(authDb, makeScopeReader());
    const result = await controller.me(makeOwner(), makeReq());
    expect(result.permissions.billing).toEqual(expect.arrayContaining(['read', 'update']));
    expect(result.permissions.billing).toHaveLength(2);
  });

  // D-06: a non-owner's operational rights come from the role held at the active location, not
  // from the tenant-level member row. `staff` alone carries none of them.
  it('a cashier-foh at the active location gets order:cancel and no billing key', async () => {
    const authDb = makeAuthDb([
      {
        id: 'role-1',
        role: 'cashier-foh',
        permission: { order: ['read', 'update-status', 'cancel'], menu: ['read'] },
      },
    ]);
    const controller = new MeController(authDb, makeScopeReader('cashier-foh'));
    const result = await controller.me(makeCashierFoh(), makeReq(LOCATION_ID));
    expect(result.permissions.order).toContain('cancel');
    expect(result.permissions.billing).toBeUndefined();
  });

  // The bug this pins: /v1/me used to answer from the tenant role alone while the guard unioned in
  // the location role, so the server permitted what it told the client was forbidden.
  it('matches what a request would allow — the same union, not the tenant role alone', async () => {
    const authDb = makeAuthDb([
      {
        id: 'role-1',
        role: 'cashier-foh',
        permission: { order: ['read', 'update-status', 'cancel'], menu: ['read'] },
      },
    ]);
    const controller = new MeController(authDb, makeScopeReader('cashier-foh'));

    const withLocation = await controller.me(makeCashierFoh(), makeReq(LOCATION_ID));
    expect(withLocation.permissions.order).toBeDefined();

    const withoutLocation = await controller.me(makeCashierFoh(), makeReq(null));
    expect(withoutLocation.permissions.order).toBeUndefined();
    expect(withoutLocation.permissions.tenant).toContain('read');
  });

  it("a bare staff member's response contains no order key", async () => {
    const authDb = makeAuthDb();
    const controller = new MeController(authDb, makeScopeReader());
    const result = await controller.me(makeBareStaff(), makeReq());
    expect(result.permissions.order).toBeUndefined();
  });

  it('returns an empty permissions object for a customer principal, without querying authDb', async () => {
    const authDb = makeAuthDb();
    const controller = new MeController(authDb, makeScopeReader());
    const customer: CustomerPrincipal = {
      kind: 'customer',
      userId: 'user-customer',
      phone: '+15551234567',
      tenantId: ORG_ID,
    };
    const result = await controller.me(customer, makeReq());
    expect(result.permissions).toEqual({});
    expect(authDb.db.select).not.toHaveBeenCalled();
  });

  it('returns an empty permissions object for an anonymous principal, without querying authDb', async () => {
    const authDb = makeAuthDb();
    const controller = new MeController(authDb, makeScopeReader());
    const anonymous: AnonymousPrincipal = { kind: 'anonymous' };
    const result = await controller.me(anonymous, makeReq());
    expect(result.permissions).toEqual({});
    expect(authDb.db.select).not.toHaveBeenCalled();
  });

  it('returns an empty permissions object for an operator with no tenantId', async () => {
    const authDb = makeAuthDb();
    const controller = new MeController(authDb, makeScopeReader());
    const operatorNoTenant: OperatorPrincipal = {
      kind: 'operator',
      userId: 'user-fresh',
      email: 'fresh@example.com',
    };
    const result = await controller.me(operatorNoTenant, makeReq());
    expect(result.permissions).toEqual({});
    expect(authDb.db.select).not.toHaveBeenCalled();
  });
});
