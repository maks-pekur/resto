import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { type ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { BrandScopeGuard } from '../../../src/contexts/identity/interfaces/http/guards/brand-scope.guard';
import type { MemberBrandScopeReader } from '../../../src/contexts/identity/application/ports/member-brand-scope-reader.port';
import type { Principal } from '../../../src/contexts/identity/domain/principal';

vi.mock('@resto/db', () => ({
  getBrandId: vi.fn(),
}));

import { getBrandId } from '@resto/db';
const mockGetBrandId = vi.mocked(getBrandId);

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const BRAND_ID = '22222222-2222-2222-2222-222222222222';
const OTHER_BRAND_ID = '33333333-3333-3333-3333-333333333333';

const operator = (over: Partial<Extract<Principal, { kind: 'operator' }>> = {}) => ({
  kind: 'operator' as const,
  userId: 'u1',
  email: 'op@example.com',
  tenantId: TENANT_ID,
  baseRole: 'staff' as const,
  ...over,
});

const buildContext = (req: { principal?: Principal }): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => () => undefined,
    getClass: () => Object,
  }) as unknown as ExecutionContext;

const buildGuard = (
  options: {
    requireBrand?: boolean;
    scope?: readonly string[] | null;
  } = {},
) => {
  const reflector = new Reflector();
  vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(options.requireBrand ?? false);
  const reader: MemberBrandScopeReader = {
    findBrandScopeForMember: vi.fn().mockResolvedValue(options.scope ?? null),
  };
  return { guard: new BrandScopeGuard(reflector, reader), reader };
};

describe('BrandScopeGuard', () => {
  it('passes when the route is not annotated @RequireBrand', async () => {
    mockGetBrandId.mockReturnValue(BRAND_ID);
    const { guard } = buildGuard({ requireBrand: false });
    await expect(guard.canActivate(buildContext({ principal: operator() }))).resolves.toBe(true);
  });

  it('rejects when @RequireBrand is set but no brand is bound to ALS', async () => {
    mockGetBrandId.mockReturnValue(undefined);
    const { guard } = buildGuard({ requireBrand: true });
    await expect(guard.canActivate(buildContext({ principal: operator() }))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rejects when the principal is not an operator', async () => {
    mockGetBrandId.mockReturnValue(BRAND_ID);
    const { guard } = buildGuard({ requireBrand: true });
    await expect(
      guard.canActivate(
        buildContext({
          principal: {
            kind: 'customer',
            userId: 'c1',
            phone: '+1',
            tenantId: TENANT_ID,
          },
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('bypasses scope check when the operator baseRole is owner', async () => {
    mockGetBrandId.mockReturnValue(BRAND_ID);
    const { guard, reader } = buildGuard({ requireBrand: true, scope: [OTHER_BRAND_ID] });
    await expect(
      guard.canActivate(buildContext({ principal: operator({ baseRole: 'owner' }) })),
    ).resolves.toBe(true);
    expect(reader.findBrandScopeForMember).not.toHaveBeenCalled();
  });

  it('passes for non-owner when scope is empty (default-allow)', async () => {
    mockGetBrandId.mockReturnValue(BRAND_ID);
    const { guard } = buildGuard({ requireBrand: true, scope: null });
    await expect(guard.canActivate(buildContext({ principal: operator() }))).resolves.toBe(true);
  });

  it('passes for non-owner when the brand is in the explicit scope', async () => {
    mockGetBrandId.mockReturnValue(BRAND_ID);
    const { guard } = buildGuard({
      requireBrand: true,
      scope: [BRAND_ID, OTHER_BRAND_ID],
    });
    await expect(guard.canActivate(buildContext({ principal: operator() }))).resolves.toBe(true);
  });

  it('rejects with brand.access_denied when the brand is not in scope', async () => {
    mockGetBrandId.mockReturnValue(BRAND_ID);
    const { guard } = buildGuard({ requireBrand: true, scope: [OTHER_BRAND_ID] });
    await expect(guard.canActivate(buildContext({ principal: operator() }))).rejects.toMatchObject({
      response: { code: 'brand.access_denied' },
    });
  });

  it('rejects when the operator has no tenantId on the principal', async () => {
    mockGetBrandId.mockReturnValue(BRAND_ID);
    const { guard } = buildGuard({ requireBrand: true });
    const { tenantId: _omit, ...operatorWithoutTenant } = operator();
    await expect(
      guard.canActivate(buildContext({ principal: operatorWithoutTenant })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
