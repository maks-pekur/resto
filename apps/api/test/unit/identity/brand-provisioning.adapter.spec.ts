import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { BrandId, BrandSlug, TenantId } from '@resto/domain';
import { BrandProvisioningAdapter } from '../../../src/contexts/identity/infrastructure/brand-provisioning.adapter';
import { BrandSlugConflictError } from '../../../src/contexts/identity/domain/brand-errors';
import type { BrandQueriesService } from '../../../src/contexts/tenancy/application/brand-queries.service';
import type { ProvisionBrandService } from '../../../src/contexts/tenancy/application/provision-brand.service';
import type { BrandSnapshot } from '../../../src/contexts/tenancy/domain/brand.aggregate';

const TENANT_ID = TenantId.parse('11111111-1111-4111-8111-111111111111');
const BRAND_ID = BrandId.parse('22222222-2222-4222-8222-222222222222');
const INPUT = {
  tenantId: TENANT_ID,
  slug: BrandSlug.parse('z-burger'),
  displayName: 'Z Burger',
};

const buildSnapshot = (over: Partial<BrandSnapshot> = {}): BrandSnapshot => ({
  id: BRAND_ID,
  tenantId: TENANT_ID,
  slug: 'z-burger',
  displayName: 'Z Burger',
  status: 'active',
  theme: null,
  ...over,
});

const buildQueries = (rows: readonly BrandSnapshot[]): BrandQueriesService =>
  ({ listForTenant: vi.fn().mockResolvedValue(rows) }) as unknown as BrandQueriesService;

const buildProvisioner = (
  impl: () => Promise<BrandSnapshot> = () => Promise.resolve(buildSnapshot()),
): ProvisionBrandService => ({ execute: vi.fn(impl) }) as unknown as ProvisionBrandService;

const runProvision = (provisioner: ProvisionBrandService) =>
  new BrandProvisioningAdapter(buildQueries([]), provisioner).provision(INPUT);

describe('BrandProvisioningAdapter', () => {
  describe('listForTenant', () => {
    it('projects BrandSnapshot to the identity-side IdentityBrandView', async () => {
      const queries = buildQueries([
        buildSnapshot({
          theme: { logoUrl: 'https://example.com/logo.png', primaryColor: '#fff', font: 'Inter' },
        }),
        buildSnapshot({
          id: BrandId.parse('33333333-3333-4333-8333-333333333333'),
          slug: 'b-burger',
          displayName: 'B Burger',
        }),
      ]);
      const adapter = new BrandProvisioningAdapter(queries, buildProvisioner());

      const result = await adapter.listForTenant(TENANT_ID, ['scope-1']);

      expect(queries.listForTenant).toHaveBeenCalledWith(TENANT_ID, ['scope-1']);
      expect(result).toEqual([
        { id: BRAND_ID, slug: 'z-burger', displayName: 'Z Burger' },
        {
          id: '33333333-3333-4333-8333-333333333333',
          slug: 'b-burger',
          displayName: 'B Burger',
        },
      ]);
    });
  });

  describe('provision', () => {
    it('returns the IdentityBrandView projected from the provisioner snapshot', async () => {
      const result = await runProvision(buildProvisioner());
      expect(result).toEqual({ id: BRAND_ID, slug: 'z-burger', displayName: 'Z Burger' });
    });

    it('maps 23505 with brands_slug_active_uq constraint into BrandSlugConflictError', async () => {
      const dbErr = Object.assign(new Error('unique_violation'), {
        code: '23505',
        constraint_name: 'brands_slug_active_uq',
      });
      await expect(
        runProvision(buildProvisioner(() => Promise.reject(dbErr))),
      ).rejects.toBeInstanceOf(BrandSlugConflictError);
    });

    it('maps 23505 with brands_tenant_slug_uq constraint into BrandSlugConflictError', async () => {
      const dbErr = Object.assign(new Error('unique_violation'), {
        code: '23505',
        constraint_name: 'brands_tenant_slug_uq',
      });
      await expect(
        runProvision(buildProvisioner(() => Promise.reject(dbErr))),
      ).rejects.toBeInstanceOf(BrandSlugConflictError);
    });

    it('also recognises the legacy `constraint` field name (older drivers)', async () => {
      const dbErr = Object.assign(new Error('unique_violation'), {
        code: '23505',
        constraint: 'brands_slug_active_uq',
      });
      await expect(
        runProvision(buildProvisioner(() => Promise.reject(dbErr))),
      ).rejects.toBeInstanceOf(BrandSlugConflictError);
    });

    it('unwraps DrizzleQueryError to find a brand-slug 23505 on .cause', async () => {
      const cause = Object.assign(new Error('unique_violation'), {
        code: '23505',
        constraint_name: 'brands_slug_active_uq',
      });
      const wrapped = Object.assign(new Error('Failed query: insert...'), { cause });
      await expect(
        runProvision(buildProvisioner(() => Promise.reject(wrapped))),
      ).rejects.toBeInstanceOf(BrandSlugConflictError);
    });

    it('does NOT map a 23505 from an unrelated unique constraint', async () => {
      const dbErr = Object.assign(new Error('unique_violation'), {
        code: '23505',
        constraint_name: 'brand_default_settings_brand_uq',
      });
      await expect(runProvision(buildProvisioner(() => Promise.reject(dbErr)))).rejects.toBe(dbErr);
    });

    it('does NOT map a 23505 with no constraint name', async () => {
      const dbErr = Object.assign(new Error('unique_violation'), { code: '23505' });
      await expect(runProvision(buildProvisioner(() => Promise.reject(dbErr)))).rejects.toBe(dbErr);
    });

    it('passes through non-conflict errors unchanged', async () => {
      const dbErr = new Error('connection refused');
      await expect(runProvision(buildProvisioner(() => Promise.reject(dbErr)))).rejects.toBe(dbErr);
    });
  });
});
