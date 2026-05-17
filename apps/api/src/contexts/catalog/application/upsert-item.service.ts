import { Inject, Injectable } from '@nestjs/common';
import { getBrandId, requireTenantContext } from '@resto/db';
import { Currency, MoneyAmount } from '@resto/domain';
import { CATALOG_REPOSITORY, type CatalogRepository } from '../domain/ports';
import type { UpsertItemInput } from './dto';

@Injectable()
export class UpsertItemService {
  constructor(@Inject(CATALOG_REPOSITORY) private readonly repo: CatalogRepository) {}

  async execute(input: UpsertItemInput): Promise<{ id: string }> {
    // RestoZodValidationPipe already validated constraints via MoneyAmountValue /
    // CurrencyValue (packages/domain/src/money.ts). Brands are purely TS; cast at
    // the HTTP→service boundary per ADR-0020 I-7.
    const basePrice = input.basePrice as MoneyAmount;
    const currency = input.currency as Currency;
    const ctx = requireTenantContext();
    const brandId = getBrandId() ?? null;
    return this.repo.upsertItem({
      ...(input.id ? { id: input.id } : {}),
      tenantId: ctx.tenantId,
      brandId,
      categoryId: input.categoryId,
      slug: input.slug,
      name: input.name,
      description: input.description,
      basePrice: basePrice,
      currency: currency,
      imageS3Key: input.imageS3Key,
      allergens: input.allergens,
      status: input.status,
      sortOrder: input.sortOrder,
    });
  }
}
