import { Inject, Injectable } from '@nestjs/common';
import { requireTenantContext } from '@resto/db';
import { MoneyAmount } from '@resto/domain';
import { CATALOG_REPOSITORY, type CatalogRepository } from '../../domain/ports';
import type { UpsertModifierOptionInput } from '../dto';

@Injectable()
export class UpsertModifierOptionService {
  constructor(@Inject(CATALOG_REPOSITORY) private readonly repo: CatalogRepository) {}

  async execute(input: UpsertModifierOptionInput): Promise<{ id: string }> {
    const ctx = requireTenantContext();
    const priceDelta = input.priceDelta as MoneyAmount;
    return this.repo.upsertModifierOption({
      ...(input.id ? { id: input.id } : {}),
      tenantId: ctx.tenantId,
      name: input.name,
      description: input.description,
      imageS3Key: input.imageS3Key,
      priceDelta,
      defaultAmount: input.defaultAmount,
      freeAmount: input.freeAmount,
      sortOrder: input.sortOrder,
      minAmount: input.minAmount,
      maxAmount: input.maxAmount,
      source: 'manual',
      sourceExternalId: null,
    });
  }
}
