import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { BrandId, BrandSlug, TenantId } from '@resto/domain';
import { CreateMyBrandService } from '../../../src/contexts/identity/application/create-my-brand.service';
import { BrandSlugConflictError } from '../../../src/contexts/identity/domain/brand-errors';
import type { ProvisionBrandService } from '../../../src/contexts/tenancy/application/provision-brand.service';
import type { BrandSnapshot } from '../../../src/contexts/tenancy/domain/brand.aggregate';

const TENANT_ID = TenantId.parse('11111111-1111-4111-8111-111111111111');
const BRAND_ID = BrandId.parse('22222222-2222-4222-8222-222222222222');

const buildSnapshot = (over: Partial<BrandSnapshot> = {}): BrandSnapshot => ({
  id: BRAND_ID,
  tenantId: TENANT_ID,
  slug: 'z-burger',
  displayName: 'Z Burger',
  status: 'active',
  theme: null,
  ...over,
});

const buildProvision = (
  impl: () => Promise<BrandSnapshot> = () => Promise.resolve(buildSnapshot()),
): ProvisionBrandService => ({ execute: vi.fn(impl) }) as unknown as ProvisionBrandService;

describe('CreateMyBrandService', () => {
  it('delegates to ProvisionBrandService and returns the snapshot', async () => {
    const provision = buildProvision();
    const service = new CreateMyBrandService(provision);

    const result = await service.execute({
      tenantId: TENANT_ID,
      slug: BrandSlug.parse('z-burger'),
      displayName: 'Z Burger',
    });

    expect(result.id).toBe(BRAND_ID);
    expect(provision.execute).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      slug: 'z-burger',
      displayName: 'Z Burger',
    });
  });

  it('maps Postgres unique-violation 23505 into BrandSlugConflictError', async () => {
    const dbErr = Object.assign(new Error('unique_violation'), { code: '23505' });
    const provision = buildProvision(() => Promise.reject(dbErr));
    const service = new CreateMyBrandService(provision);

    await expect(
      service.execute({
        tenantId: TENANT_ID,
        slug: BrandSlug.parse('z-burger'),
        displayName: 'Z Burger',
      }),
    ).rejects.toBeInstanceOf(BrandSlugConflictError);
  });

  it('maps DrizzleQueryError wrapping 23505 into BrandSlugConflictError', async () => {
    const cause = Object.assign(new Error('unique_violation'), { code: '23505' });
    const wrappedErr = Object.assign(new Error('Failed query: insert...'), { cause });
    const provision = buildProvision(() => Promise.reject(wrappedErr));
    const service = new CreateMyBrandService(provision);

    await expect(
      service.execute({
        tenantId: TENANT_ID,
        slug: BrandSlug.parse('z-burger'),
        displayName: 'Z Burger',
      }),
    ).rejects.toBeInstanceOf(BrandSlugConflictError);
  });

  it('passes through non-conflict errors unchanged', async () => {
    const dbErr = new Error('connection refused');
    const provision = buildProvision(() => Promise.reject(dbErr));
    const service = new CreateMyBrandService(provision);

    await expect(
      service.execute({
        tenantId: TENANT_ID,
        slug: BrandSlug.parse('z-burger'),
        displayName: 'Z Burger',
      }),
    ).rejects.toBe(dbErr);
  });
});
