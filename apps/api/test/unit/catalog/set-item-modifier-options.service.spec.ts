import { describe, expect, it, vi } from 'vitest';
import { runInTenantContext } from '@resto/db';
import { SetItemModifierOptionsService } from '../../../src/contexts/catalog/application/modifiers/set-item-modifier-options.service';
import { MenuIngredientAlreadyAttachedError } from '../../../src/contexts/catalog/domain/errors';
import type { CatalogRepository } from '../../../src/contexts/catalog/domain/ports';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const ITEM_ID = '22222222-2222-4222-8222-222222222222';

const buildRepo = (): CatalogRepository =>
  ({
    replaceItemModifierOptions: vi.fn().mockResolvedValue({ id: ITEM_ID }),
  }) as unknown as CatalogRepository;

describe('SetItemModifierOptionsService', () => {
  it('passes the incoming id list straight through to replaceItemModifierOptions', async () => {
    const repo = buildRepo();
    const service = new SetItemModifierOptionsService(repo);
    const optionIds = [
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    ];

    const result = await runInTenantContext({ tenantId: TENANT_ID }, () =>
      service.execute({ itemId: ITEM_ID, optionIds }),
    );

    expect(result).toEqual({ id: ITEM_ID });
    expect(repo.replaceItemModifierOptions).toHaveBeenCalledWith({
      itemId: ITEM_ID,
      optionIds,
    });
  });

  it('propagates MenuIngredientAlreadyAttachedError from the repository unchanged (D-04)', async () => {
    const repo = buildRepo();
    const groupId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    vi.mocked(repo.replaceItemModifierOptions).mockRejectedValue(
      new MenuIngredientAlreadyAttachedError(groupId, 'Toppings'),
    );
    const service = new SetItemModifierOptionsService(repo);

    await expect(
      runInTenantContext({ tenantId: TENANT_ID }, () =>
        service.execute({ itemId: ITEM_ID, optionIds: [groupId] }),
      ),
    ).rejects.toBeInstanceOf(MenuIngredientAlreadyAttachedError);
  });

  it('accepts an empty list as a legal write', async () => {
    const repo = buildRepo();
    const service = new SetItemModifierOptionsService(repo);

    const result = await runInTenantContext({ tenantId: TENANT_ID }, () =>
      service.execute({ itemId: ITEM_ID, optionIds: [] }),
    );

    expect(result).toEqual({ id: ITEM_ID });
    expect(repo.replaceItemModifierOptions).toHaveBeenCalledWith({
      itemId: ITEM_ID,
      optionIds: [],
    });
  });
});
