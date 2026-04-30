import { describe, expect, it } from 'vitest';
import { getTenantContext, requireTenantContext, runInTenantContext } from '../../src/context';

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
});
