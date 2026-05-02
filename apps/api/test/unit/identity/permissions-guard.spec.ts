import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { type ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from '../../../src/contexts/identity/interfaces/http/guards/permissions.guard';
import type { Principal } from '../../../src/contexts/identity/domain/principal';

const buildContext = (req: {
  principal?: Principal;
  headers?: Record<string, string>;
}): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => () => undefined,
    getClass: () => Object,
  }) as unknown as ExecutionContext;

const operator: Principal = {
  kind: 'operator',
  userId: 'u1',
  email: 'op@example.com',
  tenantId: 't1',
  baseRole: 'admin',
};

const customer: Principal = {
  kind: 'customer',
  userId: 'c1',
  phone: '+380000000000',
  tenantId: 't1',
};

describe('PermissionsGuard', () => {
  it('passes when no @Permissions metadata is set', async () => {
    const reflector = new Reflector();
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const checker = { hasPermission: vi.fn() };
    const guard = new PermissionsGuard(reflector, checker);
    const ctx = buildContext({ principal: operator, headers: {} });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(checker.hasPermission).not.toHaveBeenCalled();
  });

  it('forbids when principal kind is customer', async () => {
    const reflector = new Reflector();
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue({ menu: ['update'] });
    const checker = { hasPermission: vi.fn() };
    const guard = new PermissionsGuard(reflector, checker);
    const ctx = buildContext({ principal: customer, headers: {} });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('forbids when no principal is on req', async () => {
    const reflector = new Reflector();
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue({ menu: ['update'] });
    const checker = { hasPermission: vi.fn() };
    const guard = new PermissionsGuard(reflector, checker);
    const ctx = buildContext({ headers: {} });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('passes when operator has permission', async () => {
    const reflector = new Reflector();
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue({ menu: ['update'] });
    const checker = { hasPermission: vi.fn().mockResolvedValue(true) };
    const guard = new PermissionsGuard(reflector, checker);
    const ctx = buildContext({ principal: operator, headers: {} });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(checker.hasPermission).toHaveBeenCalledWith(
      operator,
      { menu: ['update'] },
      expect.anything(),
    );
  });

  it('forbids when operator lacks permission', async () => {
    const reflector = new Reflector();
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue({ billing: ['update'] });
    const checker = { hasPermission: vi.fn().mockResolvedValue(false) };
    const guard = new PermissionsGuard(reflector, checker);
    const ctx = buildContext({ principal: operator, headers: {} });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
