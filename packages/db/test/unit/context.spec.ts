import { describe, expect, it } from 'vitest';
import {
  getBrandId,
  getTenantContext,
  requireTenantContext,
  runInTenantContext,
  withBrand,
} from '../../src/context';

const TENANT_A = '00000000-0000-4000-8000-00000000000a';

describe('TenantContext', () => {
  it('returns undefined when no context is bound', () => {
    expect(getTenantContext()).toBeUndefined();
  });

  it('throws on requireTenantContext outside a context block', () => {
    expect(() => requireTenantContext()).toThrow(/No tenant context bound/);
  });

  it('binds and exposes a context inside runInTenantContext', async () => {
    await runInTenantContext({ tenantId: TENANT_A }, () => {
      expect(requireTenantContext().tenantId).toBe(TENANT_A);
      return Promise.resolve();
    });
  });

  it('rejects non-uuid tenant ids', async () => {
    await expect(
      runInTenantContext({ tenantId: 'not-a-uuid' }, () => Promise.resolve()),
    ).rejects.toThrow(/Invalid tenant id/);
  });

  it('does not leak context to sibling async tasks', async () => {
    const seen: (string | undefined)[] = [];
    await Promise.all([
      runInTenantContext({ tenantId: TENANT_A }, () => {
        seen.push(getTenantContext()?.tenantId);
        return Promise.resolve();
      }),
      Promise.resolve().then(() => {
        seen.push(getTenantContext()?.tenantId);
      }),
    ]);
    expect(seen).toEqual([TENANT_A, undefined]);
  });

  it('runInTenantContext carries brandId when provided', async () => {
    const tenantId = '11111111-1111-1111-1111-111111111111';
    const brandId = '22222222-2222-2222-2222-222222222222';
    await runInTenantContext({ tenantId, brandId }, () => {
      expect(getBrandId()).toBe(brandId);
      return Promise.resolve();
    });
  });

  it('getBrandId returns undefined when no brand is bound', async () => {
    const tenantId = '11111111-1111-1111-1111-111111111111';
    await runInTenantContext({ tenantId }, () => {
      expect(getBrandId()).toBeUndefined();
      return Promise.resolve();
    });
  });

  it('withBrand overrides the brand for nested calls', async () => {
    const tenantId = '11111111-1111-1111-1111-111111111111';
    const brandA = '22222222-2222-2222-2222-222222222222';
    const brandB = '33333333-3333-3333-3333-333333333333';
    await runInTenantContext({ tenantId, brandId: brandA }, async () => {
      expect(getBrandId()).toBe(brandA);
      await withBrand(brandB, () => {
        expect(getBrandId()).toBe(brandB);
        return Promise.resolve();
      });
      expect(getBrandId()).toBe(brandA);
    });
  });

  it('rejects an invalid brandId', async () => {
    const tenantId = '11111111-1111-1111-1111-111111111111';
    await expect(
      runInTenantContext({ tenantId, brandId: 'not-a-uuid' }, () => Promise.resolve()),
    ).rejects.toThrow(/brand id/i);
  });
});
