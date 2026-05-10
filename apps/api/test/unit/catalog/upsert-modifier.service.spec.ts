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

const baseInput = UpsertModifierInput.parse({
  name: { en: 'Spice level' },
  minSelectable: 0,
  maxSelectable: 1,
  isRequired: false,
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
      brandId: null,
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

  it('passes brandId from ALS to the repo when bound', async () => {
    const repo = buildRepo();
    const service = new UpsertModifierService(repo);

    await runInTenantContext(
      { tenantId: TENANT_ID, brandId: '33333333-3333-4333-8333-333333333333' },
      () => service.execute(baseInput),
    );

    expect(repo.upsertModifier).toHaveBeenCalledWith(
      expect.objectContaining({ brandId: '33333333-3333-4333-8333-333333333333' }),
    );
  });

  it('passes brandId=null when no brand is bound to ALS', async () => {
    const repo = buildRepo();
    const service = new UpsertModifierService(repo);

    await runInTenantContext({ tenantId: TENANT_ID }, () => service.execute(baseInput));

    expect(repo.upsertModifier).toHaveBeenCalledWith(expect.objectContaining({ brandId: null }));
  });
});
