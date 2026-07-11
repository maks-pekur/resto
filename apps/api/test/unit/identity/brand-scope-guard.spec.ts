import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { type ExecutionContext, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { BrandScopeGuard } from '../../../src/contexts/identity/interfaces/http/guards/brand-scope.guard';
import type { MemberLocationScopeReader } from '../../../src/contexts/identity/application/ports/member-location-scope-reader.port';
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

const buildContext = (req: {
  principal?: Principal;
  activeBrandId?: string | null;
}): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => () => undefined,
    getClass: () => Object,
  }) as unknown as ExecutionContext;

const buildGuard = (
  options: {
    brandNeutral?: boolean;
    scope?: readonly string[] | null;
  } = {},
) => {
  const reflector = new Reflector();
  vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(options.brandNeutral ?? false);
  const reader: MemberLocationScopeReader = {
    findLocationScopeForMember: vi.fn().mockResolvedValue(null),
    findReachableBrandsForMember: vi.fn().mockResolvedValue(options.scope ?? null),
    findRoleForMemberAtLocation: vi.fn().mockResolvedValue(null),
    findPinnableLocations: vi.fn().mockResolvedValue([]),
    listLocationRolesForMember: vi.fn().mockResolvedValue([]),
  };
  return { guard: new BrandScopeGuard(reflector, reader), reader };
};

describe('BrandScopeGuard', () => {
  describe('@BrandNeutral opt-out', () => {
    it('passes when the route is @BrandNeutral (opt-out)', async () => {
      mockGetBrandId.mockReturnValue(BRAND_ID);
      const { guard } = buildGuard({ brandNeutral: true });
      await expect(guard.canActivate(buildContext({ principal: operator() }))).resolves.toBe(true);
    });
  });

  describe('default-on (no @BrandNeutral)', () => {
    it('rejects with brand.context_required when no brand is bound to ALS', async () => {
      mockGetBrandId.mockReturnValue(undefined);
      const { guard } = buildGuard({ brandNeutral: false });
      await expect(
        guard.canActivate(buildContext({ principal: operator() })),
      ).rejects.toMatchObject({ response: { code: 'brand.context_required' } });
    });

    it('rejects with brand.operator_required for anonymous principal (no @BrandNeutral, brand resolves)', async () => {
      mockGetBrandId.mockReturnValue(BRAND_ID);
      const { guard } = buildGuard({ brandNeutral: false });
      await expect(
        guard.canActivate(
          buildContext({
            principal: { kind: 'anonymous' },
          }),
        ),
      ).rejects.toMatchObject({ response: { code: 'brand.operator_required' } });
    });

    it('rejects with brand.operator_required for customer principal without @BrandNeutral', async () => {
      mockGetBrandId.mockReturnValue(BRAND_ID);
      const { guard } = buildGuard({ brandNeutral: false });
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

    it('rejects when the operator has no tenantId on the principal', async () => {
      mockGetBrandId.mockReturnValue(BRAND_ID);
      const { guard } = buildGuard({ brandNeutral: false });
      const { tenantId: _omit, ...operatorWithoutTenant } = operator();
      await expect(
        guard.canActivate(
          buildContext({ principal: operatorWithoutTenant, activeBrandId: BRAND_ID }),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('owner bypass', () => {
    it('passes for owner with zero scope rows (owner free-switch, not locked out)', async () => {
      mockGetBrandId.mockReturnValue(BRAND_ID);
      const { guard, reader } = buildGuard({ brandNeutral: false, scope: null });
      await expect(
        guard.canActivate(
          buildContext({ principal: operator({ baseRole: 'owner' }), activeBrandId: null }),
        ),
      ).resolves.toBe(true);
      expect(reader.findReachableBrandsForMember).not.toHaveBeenCalled();
    });

    it('passes for owner even when brand != activeBrandId pin (owner free-switch)', async () => {
      mockGetBrandId.mockReturnValue(BRAND_ID);
      const { guard, reader } = buildGuard({ brandNeutral: false, scope: [OTHER_BRAND_ID] });
      await expect(
        guard.canActivate(
          buildContext({
            principal: operator({ baseRole: 'owner' }),
            activeBrandId: OTHER_BRAND_ID,
          }),
        ),
      ).resolves.toBe(true);
      expect(reader.findReachableBrandsForMember).not.toHaveBeenCalled();
    });

    it('passes for owner with null pin (owner free-switch, pin check skipped)', async () => {
      mockGetBrandId.mockReturnValue(BRAND_ID);
      const { guard, reader } = buildGuard({ brandNeutral: false, scope: null });
      await expect(
        guard.canActivate(
          buildContext({ principal: operator({ baseRole: 'owner' }), activeBrandId: null }),
        ),
      ).resolves.toBe(true);
      expect(reader.findReachableBrandsForMember).not.toHaveBeenCalled();
    });
  });

  describe('D-10 pin reconciliation (non-owner)', () => {
    it('throws NotFoundException for non-owner with null activeBrandId (null-pin bypass closed)', async () => {
      mockGetBrandId.mockReturnValue(BRAND_ID);
      const { guard } = buildGuard({ brandNeutral: false, scope: [BRAND_ID] });
      await expect(
        guard.canActivate(buildContext({ principal: operator(), activeBrandId: null })),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFoundException for non-owner when ALS brand != session pin', async () => {
      mockGetBrandId.mockReturnValue(BRAND_ID);
      const { guard } = buildGuard({ brandNeutral: false, scope: [BRAND_ID] });
      await expect(
        guard.canActivate(buildContext({ principal: operator(), activeBrandId: OTHER_BRAND_ID })),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('D-08 default-deny (non-owner)', () => {
    it('rejects with brand.access_denied for non-owner when scope is empty (default-deny, was default-allow)', async () => {
      mockGetBrandId.mockReturnValue(BRAND_ID);
      const { guard } = buildGuard({ brandNeutral: false, scope: null });
      await expect(
        guard.canActivate(buildContext({ principal: operator(), activeBrandId: BRAND_ID })),
      ).rejects.toMatchObject({ response: { code: 'brand.access_denied' } });
    });

    it('passes for non-owner when brand is in scope AND pin matches', async () => {
      mockGetBrandId.mockReturnValue(BRAND_ID);
      const { guard } = buildGuard({
        brandNeutral: false,
        scope: [BRAND_ID, OTHER_BRAND_ID],
      });
      await expect(
        guard.canActivate(buildContext({ principal: operator(), activeBrandId: BRAND_ID })),
      ).resolves.toBe(true);
    });

    it('rejects with brand.access_denied when brand is not in scope', async () => {
      mockGetBrandId.mockReturnValue(BRAND_ID);
      const { guard } = buildGuard({ brandNeutral: false, scope: [OTHER_BRAND_ID] });
      await expect(
        guard.canActivate(buildContext({ principal: operator(), activeBrandId: BRAND_ID })),
      ).rejects.toMatchObject({ response: { code: 'brand.access_denied' } });
    });
  });
});
