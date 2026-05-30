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
    // 04A-05: slug optional in DTO (auto-derived in plan 06). imageS3Key removed
    // in favour of `photos[]`; until plan 06 refactors the repository row, we
    // derive imageS3Key from the first photo so existing storage code stays
    // valid. Plan 06 replaces the repo row to accept `photos[]` directly.
    return this.repo.upsertItem({
      ...(input.id ? { id: input.id } : {}),
      tenantId: ctx.tenantId,
      brandId,
      categoryId: input.categoryId,
      slug: input.slug ?? '',
      name: input.name,
      description: input.description,
      basePrice: basePrice,
      currency: currency,
      imageS3Key: input.photos[0]?.s3Key ?? null,
      allergens: input.allergens,
      status: input.status,
      sortOrder: input.sortOrder,
    });
  }
}
