import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { type ExecutionContext, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OwnerOnlyGuard } from '../../../src/contexts/identity/interfaces/http/guards/owner-only.guard';
import type { Principal } from '../../../src/contexts/identity/domain/principal';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';

const operator = (over: Partial<Extract<Principal, { kind: 'operator' }>> = {}) => ({
  kind: 'operator' as const,
  userId: 'u1',
  email: 'op@example.com',
  tenantId: TENANT_ID,
  baseRole: 'owner' as const,
  ...over,
});

const buildContext = (req: { principal?: Principal }): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => () => undefined,
    getClass: () => Object,
  }) as unknown as ExecutionContext;

const buildGuard = (options: { ownerOnly?: boolean } = {}) => {
  const reflector = new Reflector();
  vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(options.ownerOnly ?? false);
  return new OwnerOnlyGuard(reflector);
};

describe('OwnerOnlyGuard', () => {
  it('passes when the route has no @OwnerOnly metadata (opt-in, absent = pass)', () => {
    const guard = buildGuard({ ownerOnly: false });
    expect(guard.canActivate(buildContext({ principal: operator({ baseRole: 'staff' }) }))).toBe(
      true,
    );
  });

  it('passes for an owner principal when @OwnerOnly is set', () => {
    const guard = buildGuard({ ownerOnly: true });
    expect(guard.canActivate(buildContext({ principal: operator({ baseRole: 'owner' }) }))).toBe(
      true,
    );
  });

  it('throws NotFoundException for a non-owner operator (staff/admin) principal', () => {
    const guard = buildGuard({ ownerOnly: true });
    expect(() =>
      guard.canActivate(buildContext({ principal: operator({ baseRole: 'staff' }) })),
    ).toThrow(NotFoundException);
    expect(() =>
      guard.canActivate(buildContext({ principal: operator({ baseRole: 'admin' }) })),
    ).toThrow(NotFoundException);
  });

  it('throws NotFoundException for anonymous or customer principals', () => {
    const guard = buildGuard({ ownerOnly: true });
    expect(() => guard.canActivate(buildContext({ principal: { kind: 'anonymous' } }))).toThrow(
      NotFoundException,
    );
    expect(() =>
      guard.canActivate(
        buildContext({
          principal: { kind: 'customer', userId: 'c1', phone: '+10000000000', tenantId: TENANT_ID },
        }),
      ),
    ).toThrow(NotFoundException);
  });

  it('throws a bare NotFoundException with no {code,message} payload (existence-hiding)', () => {
    const guard = buildGuard({ ownerOnly: true });
    try {
      guard.canActivate(buildContext({ principal: operator({ baseRole: 'staff' }) }));
      throw new Error('expected canActivate to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(NotFoundException);
      const response = (err as NotFoundException).getResponse();
      expect(response).not.toHaveProperty('code');
    }
  });
});
