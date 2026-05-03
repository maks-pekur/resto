import { describe, expect, it, vi } from 'vitest';
import { runInTenantContext } from '@resto/db';
import { PublishMenuService } from '../../../src/contexts/catalog/application/publish-menu.service';
import type { MenuVersionPort } from '../../../src/contexts/catalog/domain/ports';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';

const buildVersions = (next = 7): MenuVersionPort => ({
  current: vi.fn(),
  bump: vi.fn().mockResolvedValue(next),
});

describe('PublishMenuService', () => {
  it('bumps the per-tenant version and returns the new value', async () => {
    const versions = buildVersions(42);
    const service = new PublishMenuService(versions);

    const result = await runInTenantContext({ tenantId: TENANT_ID }, () => service.execute());

    expect(result).toEqual({ tenantId: TENANT_ID, version: 42 });
    expect(versions.bump).toHaveBeenCalledTimes(1);
    expect(versions.bump).toHaveBeenCalledWith(TENANT_ID);
  });

  it('throws when no tenant context is bound', async () => {
    const versions = buildVersions();
    const service = new PublishMenuService(versions);
    await expect(service.execute()).rejects.toThrow(/tenant context/i);
    expect(versions.bump).not.toHaveBeenCalled();
  });
});
