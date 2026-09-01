import { describe, expect, it, vi } from 'vitest';
import { runInTenantContext } from '@resto/db';
import { TenantId, TenantSlug } from '@resto/domain';
import { UpdateBrandService } from '../../../src/contexts/tenancy/application/update-brand.service';
import { BrandLogoNotOwnedError } from '../../../src/contexts/tenancy/domain/errors';
import type { BrandMediaPort, TenantRepository } from '../../../src/contexts/tenancy/domain/ports';
import { Tenant, type TenantSnapshot } from '../../../src/contexts/tenancy/domain/tenant.aggregate';

const TENANT_ID = TenantId.parse('11111111-1111-4111-8111-111111111111');

const snapshot = (over: Partial<TenantSnapshot> = {}): TenantSnapshot => ({
  ...Tenant.provision({
    slug: TenantSlug.parse('cafe-roma'),
    displayName: 'Cafe Roma',
    country: 'ES',
    primaryDomainHostname: 'cafe-roma.menu.resto.app',
  }).toSnapshot(),
  id: TENANT_ID,
  ...over,
});

const buildRepo = (current: TenantSnapshot): TenantRepository =>
  ({
    findById: vi.fn().mockResolvedValue(current),
    save: vi.fn().mockResolvedValue(undefined),
  }) as unknown as TenantRepository;

const buildMedia = (): BrandMediaPort => ({
  presignPut: vi.fn().mockResolvedValue('https://s3.example/put'),
  publish: vi.fn().mockResolvedValue('https://cdn.example/public/logo.png'),
});

const run = (service: UpdateBrandService, input: Parameters<UpdateBrandService['execute']>[0]) =>
  runInTenantContext({ tenantId: TENANT_ID }, () => service.execute(input));

describe('UpdateBrandService', () => {
  it('leaves untouched fields alone when one card is saved', async () => {
    const current = snapshot({
      description: { es: 'Cocina de barrio' },
      socials: { instagram: 'https://instagram.com/caferoma' },
    });
    const repo = buildRepo(current);
    const service = new UpdateBrandService(repo, buildMedia());

    const next = await run(service, {
      contacts: { phone: '+34 600 00 00 00', email: null, website: null },
    });

    expect(next.contacts.phone).toBe('+34 600 00 00 00');
    expect(next.description).toEqual({ es: 'Cocina de barrio' });
    expect(next.socials).toEqual({ instagram: 'https://instagram.com/caferoma' });
    expect(next.displayName).toBe('Cafe Roma');
  });

  it('publishes an uploaded logo and stores its public address', async () => {
    const repo = buildRepo(snapshot());
    const media = buildMedia();
    const service = new UpdateBrandService(repo, media);

    const next = await run(service, { logoS3Key: `tenant/${TENANT_ID}/brand/abc.png` });

    expect(media.publish).toHaveBeenCalledWith(`tenant/${TENANT_ID}/brand/abc.png`);
    expect(next.theme?.logoUrl).toBe('https://cdn.example/public/logo.png');
  });

  it('refuses a key that belongs to another tenant', async () => {
    const repo = buildRepo(snapshot());
    const media = buildMedia();
    const service = new UpdateBrandService(repo, media);

    await expect(
      run(service, { logoS3Key: 'tenant/22222222-2222-4222-8222-222222222222/brand/abc.png' }),
    ).rejects.toBeInstanceOf(BrandLogoNotOwnedError);
    expect(media.publish).not.toHaveBeenCalled();
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('drops the logo when the key is explicitly cleared', async () => {
    const repo = buildRepo(
      snapshot({
        theme: {
          logoUrl: 'https://cdn.example/old.png',
          coverUrl: null,
          primaryColor: null,
          font: null,
        },
      }),
    );
    const service = new UpdateBrandService(repo, buildMedia());

    const next = await run(service, { logoS3Key: null });

    expect(next.theme?.logoUrl).toBeNull();
  });
});
