import { Inject, Injectable } from '@nestjs/common';
import { getBrandId, requireTenantContext } from '@resto/db';
import { MoneyAmount } from '@resto/domain';
import { CATALOG_REPOSITORY, type CatalogRepository } from '../domain/ports';
import type { UpsertModifierOptionInput } from './dto';

@Injectable()
export class UpsertModifierOptionService {
  constructor(@Inject(CATALOG_REPOSITORY) private readonly repo: CatalogRepository) {}

  async execute(input: UpsertModifierOptionInput): Promise<{ id: string }> {
    const ctx = requireTenantContext();
    const brandId = getBrandId() ?? null;
    const priceDelta = input.priceDelta as MoneyAmount;
    return this.repo.upsertModifierOption({
      ...(input.id ? { id: input.id } : {}),
      tenantId: ctx.tenantId,
      brandId,
      modifierGroupId: input.modifierGroupId,
      name: input.name,
      priceDelta,
      defaultAmount: input.defaultAmount,
      freeAmount: input.freeAmount,
      sortOrder: input.sortOrder,
    });
  }
}
