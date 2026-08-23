import { describe, expect, it, vi } from 'vitest';
import { runInTenantContext } from '@resto/db';
import { LocalizedText } from '@resto/domain';
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
  minSelectable: 0,
  maxSelectable: 1,
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
      minSelectable: 0,
      maxSelectable: 1,
      isRequired: false,
    });
  });

  it('rejects at the DTO boundary when maxSelectable < minSelectable', () => {
    expect(() =>
      UpsertModifierGroupInputSchema.parse({
        name: LocalizedText.parse({ en: 'Foo' }),
        minSelectable: 3,
        maxSelectable: 1,
      }),
    ).toThrow(/maxSelectable/);
  });

  it('throws when no tenant context is bound', async () => {
    const service = new UpsertModifierGroupService(buildRepo());
    await expect(
      service.execute(UpsertModifierGroupInputSchema.parse({ name: { en: 'X' } })),
    ).rejects.toThrow(/tenant context/i);
  });
});
