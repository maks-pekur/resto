import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { CheckBrandSlugAvailabilityService } from '../../../src/contexts/identity/application/check-brand-slug-availability.service';
import type { BrandProvisioningPort } from '../../../src/contexts/identity/application/ports/brand-provisioning.port';

const buildPort = (slugs: readonly string[]): BrandProvisioningPort => ({
  listForTenant: vi.fn(),
  provision: vi.fn(),
  findActiveSlugsByPrefix: vi.fn().mockResolvedValue(slugs),
});

const run = (slug: string, slugs: readonly string[]) =>
  new CheckBrandSlugAvailabilityService(buildPort(slugs)).execute(slug);

describe('CheckBrandSlugAvailabilityService', () => {
  it('returns available when the slug is unused', async () => {
    expect(await run('z-burger', [])).toEqual({ available: true, suggestion: null });
  });

  it('returns available even if a longer-prefix neighbour exists', async () => {
    // `z-burger-east` exists but `z-burger` does not — exact slug is free.
    expect(await run('z-burger', ['z-burger-east'])).toEqual({
      available: true,
      suggestion: null,
    });
  });

  it('suggests slug-2 when the base slug is taken', async () => {
    expect(await run('z-burger', ['z-burger'])).toEqual({
      available: false,
      suggestion: 'z-burger-2',
    });
  });

  it('skips already-taken suffixes and returns the lowest free one', async () => {
    expect(await run('z-burger', ['z-burger', 'z-burger-2', 'z-burger-3'])).toEqual({
      available: false,
      suggestion: 'z-burger-4',
    });
  });

  it('returns suggestion=null when every suffix up to 99 is taken', async () => {
    const all = ['z-burger', ...Array.from({ length: 98 }, (_, i) => `z-burger-${i + 2}`)];
    expect(await run('z-burger', all)).toEqual({ available: false, suggestion: null });
  });
});
