import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { ListMyTenantsService } from '../../../src/contexts/identity/application/list-my-tenants.service';
import type { AuthDrizzle } from '../../../src/contexts/identity/infrastructure/better-auth/auth-db';

const buildAuthDb = (
  memberships: readonly { tenantId: string }[],
  tenantRows: readonly { id: string; slug: string; displayName: string; status: string }[],
): AuthDrizzle => {
  const select = vi
    .fn()
    .mockReturnValueOnce({
      from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(memberships) }),
    })
    .mockReturnValueOnce({
      from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(tenantRows) }),
    });
  return { db: { select } } as unknown as AuthDrizzle;
};

describe('ListMyTenantsService', () => {
  it('returns an empty list when the user has no memberships', async () => {
    const authDb = buildAuthDb([], []);
    const service = new ListMyTenantsService(authDb);

    const result = await service.execute({ userId: 'user-1' });

    expect(result.tenants).toEqual([]);
  });

  it('returns every tenant the user is a member of, with slug/displayName/status', async () => {
    const authDb = buildAuthDb(
      [{ tenantId: 't1' }, { tenantId: 't2' }],
      [
        { id: 't1', slug: 'acme', displayName: 'Acme', status: 'active' },
        { id: 't2', slug: 'burger-co', displayName: 'Burger Co', status: 'pending_setup' },
      ],
    );
    const service = new ListMyTenantsService(authDb);

    const result = await service.execute({ userId: 'user-1' });

    expect(result.tenants).toHaveLength(2);
    expect(result.tenants[0]).toEqual({
      id: 't1',
      slug: 'acme',
      displayName: 'Acme',
      status: 'active',
    });
    expect(result.tenants[1]).toEqual({
      id: 't2',
      slug: 'burger-co',
      displayName: 'Burger Co',
      status: 'pending_setup',
    });
  });
});
