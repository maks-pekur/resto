import { Inject, Injectable } from '@nestjs/common';
import { requireTenantContext } from '@resto/db';
import { MoneyAmount } from '@resto/domain';
import { CATALOG_REPOSITORY, type CatalogRepository } from '../../domain/ports';
import type { UpsertItemSizeInput } from '../dto';

@Injectable()
export class UpsertItemSizeService {
  constructor(@Inject(CATALOG_REPOSITORY) private readonly repo: CatalogRepository) {}

  async execute(input: UpsertItemSizeInput): Promise<{ id: string }> {
    const ctx = requireTenantContext();
    const price = input.price as MoneyAmount;
    return this.repo.upsertItemSize({
      ...(input.id ? { id: input.id } : {}),
      tenantId: ctx.tenantId,
      menuItemId: input.menuItemId,
      name: input.name,
      price,
      isDefault: input.isDefault,
      sortOrder: input.sortOrder,
    });
  }
}
