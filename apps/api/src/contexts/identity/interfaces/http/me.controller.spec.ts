import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { MeController } from './me.controller';
import type {
  OperatorPrincipal,
  CustomerPrincipal,
  AnonymousPrincipal,
} from '../../domain/principal';
import type { AuthDrizzle } from '../../infrastructure/better-auth/auth-db';

const ORG_ID = '00000000-0000-0000-0000-000000000001';

const makeAuthDb = (
  memberRoleCsv: string | null,
  customRoles: { id: string; role: string; permission: Record<string, string[]> }[] = [],
): AuthDrizzle => {
  const customRoleRows = customRoles.map((r) => ({
    id: r.id,
    role: r.role,
    permission: JSON.stringify(r.permission),
  }));

  const memberChain = {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(memberRoleCsv === null ? [] : [{ role: memberRoleCsv }]),
      }),
    }),
  };

  const roleChain = {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
          Promise.resolve(customRoleRows).then(onFulfilled, onRejected),
      }),
    }),
  };

  const select = vi.fn().mockReturnValueOnce(memberChain).mockReturnValueOnce(roleChain);

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
    const authDb = makeAuthDb('owner');
    const controller = new MeController(authDb);
    const result = await controller.me(makeOwner());
    expect(result).toMatchObject({
      kind: 'operator',
      userId: 'user-owner',
      email: 'owner@example.com',
      tenantId: ORG_ID,
      baseRole: 'owner',
    });
  });

  it('omits baseRole when absent', async () => {
    const authDb = makeAuthDb(null);
    const controller = new MeController(authDb);
    const operatorNoRole: OperatorPrincipal = {
      kind: 'operator',
      userId: 'user-fresh-2',
      email: 'fresh2@example.com',
    };
    const result = await controller.me(operatorNoRole);
    expect(result).toEqual({
      kind: 'operator',
      userId: 'user-fresh-2',
      email: 'fresh2@example.com',
      permissions: {},
    });
  });

  it("an owner's response includes billing: ['read','update'] and no permissions call errors", async () => {
    const authDb = makeAuthDb('owner');
    const controller = new MeController(authDb);
    const result = await controller.me(makeOwner());
    expect(result.permissions.billing).toEqual(expect.arrayContaining(['read', 'update']));
    expect(result.permissions.billing).toHaveLength(2);
  });

  it("a cashier-foh preset holder's response includes order:cancel and no billing key", async () => {
    const authDb = makeAuthDb('staff,cashier-foh', [
      {
        id: 'role-1',
        role: 'cashier-foh',
        permission: { order: ['read', 'update-status', 'cancel'], menu: ['read'] },
      },
    ]);
    const controller = new MeController(authDb);
    const result = await controller.me(makeCashierFoh());
    expect(result.permissions.order).toContain('cancel');
    expect(result.permissions.billing).toBeUndefined();
  });

  it("a bare staff member's response contains no order key", async () => {
    const authDb = makeAuthDb('staff');
    const controller = new MeController(authDb);
    const result = await controller.me(makeBareStaff());
    expect(result.permissions.order).toBeUndefined();
  });

  it('returns an empty permissions object for a customer principal, without querying authDb', async () => {
    const authDb = makeAuthDb(null);
    const controller = new MeController(authDb);
    const customer: CustomerPrincipal = {
      kind: 'customer',
      userId: 'user-customer',
      phone: '+15551234567',
      tenantId: ORG_ID,
    };
    const result = await controller.me(customer);
    expect(result.permissions).toEqual({});
    expect(authDb.db.select).not.toHaveBeenCalled();
  });

  it('returns an empty permissions object for an anonymous principal, without querying authDb', async () => {
    const authDb = makeAuthDb(null);
    const controller = new MeController(authDb);
    const anonymous: AnonymousPrincipal = { kind: 'anonymous' };
    const result = await controller.me(anonymous);
    expect(result.permissions).toEqual({});
    expect(authDb.db.select).not.toHaveBeenCalled();
  });

  it('returns an empty permissions object for an operator with no tenantId', async () => {
    const authDb = makeAuthDb(null);
    const controller = new MeController(authDb);
    const operatorNoTenant: OperatorPrincipal = {
      kind: 'operator',
      userId: 'user-fresh',
      email: 'fresh@example.com',
    };
    const result = await controller.me(operatorNoTenant);
    expect(result.permissions).toEqual({});
    expect(authDb.db.select).not.toHaveBeenCalled();
  });
});
