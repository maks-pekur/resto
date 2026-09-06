import { Inject, Injectable } from '@nestjs/common';
import type { TenantId } from '@resto/domain';
import {
  CATALOG_REPOSITORY,
  MENU_VERSION_PORT,
  type CatalogRepository,
  type MenuVersionPort,
} from '../../catalog/domain/ports';
import type {
  MenuPricingPort,
  OrderingMenuSnapshot,
  PricedMenuItem,
  PricedModifierGroup,
  PricedModifierOption,
} from '../domain/ports';

@Injectable()
export class CatalogMenuPricingAdapter implements MenuPricingPort {
  constructor(
    @Inject(CATALOG_REPOSITORY) private readonly catalog: CatalogRepository,
    @Inject(MENU_VERSION_PORT) private readonly versions: MenuVersionPort,
  ) {}

  async loadSnapshot(tenantId: TenantId, locationId: string): Promise<OrderingMenuSnapshot> {
    const version = await this.versions.current(tenantId);
    const [menu, stoppedItemIds, stoppedIngredientIds] = await Promise.all([
      this.catalog.loadPublishedMenu(tenantId, version),
      this.catalog.listStoppedItemIds(locationId),
      this.catalog.listStoppedIngredientIds(locationId),
    ]);

    const items: PricedMenuItem[] = menu.items.map((item) => ({
      itemId: item.id,
      categoryId: item.categoryId,
      basePrice: item.basePrice,
      sizes: item.sizes.map((s) => ({ sizeId: s.id, price: s.price })),
      modifierGroupIds: [...item.modifierGroupIds],
      extraOptionIds: [...item.extraOptionIds],
      removableOptionIds: item.compositionLines.filter((l) => l.removable).map((l) => l.optionId),
    }));

    const modifierGroups: PricedModifierGroup[] = menu.modifierGroups.map((group) => ({
      groupId: group.id,
      behaviour: group.behaviour,
      isRequired: group.isRequired,
      maxSelectable: group.maxSelectable,
    }));

    const groupIdsByOptionId = new Map<string, string[]>();
    for (const group of menu.modifierGroups) {
      for (const optionId of group.optionIds) {
        const groupIds = groupIdsByOptionId.get(optionId);
        if (groupIds) {
          groupIds.push(group.id);
        } else {
          groupIdsByOptionId.set(optionId, [group.id]);
        }
      }
    }

    const modifierOptions: PricedModifierOption[] = menu.modifierOptions.map((opt) => ({
      optionId: opt.id,
      groupIds: groupIdsByOptionId.get(opt.id) ?? [],
      priceDelta: opt.priceDelta,
      freeAmount: opt.freeAmount,
      minAmount: opt.minAmount,
      maxAmount: opt.maxAmount,
    }));

    return {
      currency: menu.currency,
      items,
      modifierGroups,
      modifierOptions,
      stoppedItemIds,
      stoppedIngredientIds,
    };
  }
}
