import { describe, expect, it, vi } from 'vitest';
import { runInTenantContext } from '@resto/db';
import { UpsertModifierGroupService } from '../../../src/contexts/catalog/application/modifiers/upsert-modifier-group.service';
import { UpsertModifierGroupInputSchema } from '../../../src/contexts/catalog/application/dto';
import type { CatalogRepository } from '../../../src/contexts/catalog/domain/ports';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';

const buildRepo = (): CatalogRepository =>
  ({
    loadPublishedMenu: vi.fn(),
    findPublishedItem: vi.fn(),
    upsertCategory: vi.fn(),
    upsertItem: vi.fn(),
    upsertModifierGroup: vi.fn().mockResolvedValue({ id: 'modifier-group-uuid' }),
    upsertModifierOption: vi.fn(),
    upsertItemSize: vi.fn(),
    addToStopList: vi.fn(),
    removeFromStopList: vi.fn(),
    getMenuFirstPublishedAt: vi.fn(),
    insertSlugAlias: vi.fn(),
  }) as unknown as CatalogRepository;

const baseInput = UpsertModifierGroupInputSchema.parse({
  name: { en: 'Spice level' },
  display: 'tiles',
  behaviour: 'several',
  isRequired: false,
});

describe('UpsertModifierGroupService', () => {
  it('forwards a tenant-scoped row to the repository', async () => {
    const repo = buildRepo();
    const service = new UpsertModifierGroupService(repo);

    const result = await runInTenantContext({ tenantId: TENANT_ID }, () =>
      service.execute(baseInput),
    );

    expect(result).toEqual({ id: 'modifier-group-uuid' });
    expect(repo.upsertModifierGroup).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      name: { en: 'Spice level' },
      display: 'tiles',
      behaviour: 'several',
      isRequired: false,
    });
  });

  it('forwards a group created with behaviour "one" and no numeric field', async () => {
    const repo = buildRepo();
    const service = new UpsertModifierGroupService(repo);
    const input = UpsertModifierGroupInputSchema.parse({
      name: { en: 'Dough' },
      display: 'tabs',
      behaviour: 'one',
      isRequired: true,
    });

    await runInTenantContext({ tenantId: TENANT_ID }, () => service.execute(input));

    const call = vi.mocked(repo.upsertModifierGroup).mock.calls[0]?.[0];
    expect(call?.behaviour).toBe('one');
    expect(call && 'minSelectable' in call).toBe(false);
    expect(call && 'maxSelectable' in call).toBe(false);
  });

  it('throws when no tenant context is bound', async () => {
    const service = new UpsertModifierGroupService(buildRepo());
    await expect(
      service.execute(
        UpsertModifierGroupInputSchema.parse({
          name: { en: 'X' },
          display: 'tiles',
          behaviour: 'several',
        }),
      ),
    ).rejects.toThrow(/tenant context/i);
  });
});
