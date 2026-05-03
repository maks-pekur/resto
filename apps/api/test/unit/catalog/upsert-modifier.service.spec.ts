import { describe, expect, it, vi } from 'vitest';
import { runInTenantContext } from '@resto/db';
import { LocalizedText } from '@resto/domain';
import { UpsertModifierService } from '../../../src/contexts/catalog/application/upsert-modifier.service';
import { UpsertModifierInput } from '../../../src/contexts/catalog/application/dto';
import type { CatalogRepository } from '../../../src/contexts/catalog/domain/ports';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';

const buildRepo = (): CatalogRepository => ({
  loadPublishedMenu: vi.fn(),
  findPublishedItem: vi.fn(),
  upsertCategory: vi.fn(),
  upsertItem: vi.fn(),
  upsertModifier: vi.fn().mockResolvedValue({ id: 'modifier-uuid' }),
});

describe('UpsertModifierService', () => {
  it('forwards a tenant-scoped row to the repository', async () => {
    const repo = buildRepo();
    const service = new UpsertModifierService(repo);

    const input = UpsertModifierInput.parse({
      name: { en: 'Spice level' },
      minSelectable: 0,
      maxSelectable: 1,
      isRequired: false,
    });

    const result = await runInTenantContext({ tenantId: TENANT_ID }, () => service.execute(input));

    expect(result).toEqual({ id: 'modifier-uuid' });
    expect(repo.upsertModifier).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      name: { en: 'Spice level' },
      minSelectable: 0,
      maxSelectable: 1,
      isRequired: false,
    });
  });

  it('rejects at the DTO boundary when maxSelectable < minSelectable', () => {
    expect(() =>
      UpsertModifierInput.parse({
        name: LocalizedText.parse({ en: 'Foo' }),
        minSelectable: 3,
        maxSelectable: 1,
      }),
    ).toThrow(/maxSelectable/);
  });

  it('throws when no tenant context is bound', async () => {
    const service = new UpsertModifierService(buildRepo());
    await expect(service.execute(UpsertModifierInput.parse({ name: { en: 'X' } }))).rejects.toThrow(
      /tenant context/i,
    );
  });
});
