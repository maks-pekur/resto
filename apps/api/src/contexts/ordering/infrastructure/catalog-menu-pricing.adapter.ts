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
    const [menu, stoppedItemIds] = await Promise.all([
      this.catalog.loadPublishedMenu(tenantId, version),
      this.catalog.listStoppedItemIds(locationId),
    ]);

    const items: PricedMenuItem[] = menu.items.map((item) => ({
      itemId: item.id,
      categoryId: item.categoryId,
      basePrice: item.basePrice,
      sizes: item.sizes.map((s) => ({ sizeId: s.id, price: s.price })),
      modifierGroupIds: [...item.modifierGroupIds],
    }));

    const modifierGroups: PricedModifierGroup[] = menu.modifierGroups.map((group) => ({
      groupId: group.id,
      minSelectable: group.minSelectable,
      maxSelectable: group.maxSelectable,
      isRequired: group.isRequired,
    }));

    const modifierOptions: PricedModifierOption[] = menu.modifierGroups.flatMap((group) =>
      group.options.map<PricedModifierOption>((opt) => ({
        optionId: opt.id,
        groupId: group.id,
        priceDelta: opt.priceDelta,
        freeAmount: opt.freeAmount,
        minAmount: opt.minAmount,
        maxAmount: opt.maxAmount,
      })),
    );

    return { currency: menu.currency, items, modifierGroups, modifierOptions, stoppedItemIds };
  }
}
