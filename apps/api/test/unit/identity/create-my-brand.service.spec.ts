import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { BrandId, BrandSlug, TenantId } from '@resto/domain';
import { CreateMyBrandService } from '../../../src/contexts/identity/application/create-my-brand.service';
import type {
  BrandProvisioningPort,
  IdentityBrandView,
} from '../../../src/contexts/identity/application/ports/brand-provisioning.port';

const TENANT_ID = TenantId.parse('11111111-1111-4111-8111-111111111111');
const BRAND_ID = BrandId.parse('22222222-2222-4222-8222-222222222222');

const buildView = (over: Partial<IdentityBrandView> = {}): IdentityBrandView => ({
  id: BRAND_ID,
  slug: 'z-burger',
  displayName: 'Z Burger',
  ...over,
});

const buildPort = (
  impl: () => Promise<IdentityBrandView> = () => Promise.resolve(buildView()),
): BrandProvisioningPort => ({
  listForTenant: vi.fn(),
  provision: vi.fn(impl),
});

describe('CreateMyBrandService', () => {
  it('delegates to the brand provisioning port with the input fields', async () => {
    const port = buildPort();
    const result = await new CreateMyBrandService(port).execute({
      tenantId: TENANT_ID,
      slug: BrandSlug.parse('z-burger'),
      displayName: 'Z Burger',
    });
    expect(result.id).toBe(BRAND_ID);
    expect(port.provision).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      slug: 'z-burger',
      displayName: 'Z Burger',
    });
  });

  it("propagates port errors unchanged (mapping is the adapter's job)", async () => {
    const err = new Error('boom');
    const port = buildPort(() => Promise.reject(err));
    await expect(
      new CreateMyBrandService(port).execute({
        tenantId: TENANT_ID,
        slug: BrandSlug.parse('z-burger'),
        displayName: 'Z Burger',
      }),
    ).rejects.toBe(err);
  });
});
