import { Inject, Injectable } from '@nestjs/common';
import { getBrandId, requireTenantContext } from '@resto/db';
import { CATALOG_REPOSITORY, type CatalogRepository } from '../domain/ports';
import type { UpsertModifierGroupInput } from './dto';

@Injectable()
export class UpsertModifierGroupService {
  constructor(@Inject(CATALOG_REPOSITORY) private readonly repo: CatalogRepository) {}

  async execute(input: UpsertModifierGroupInput): Promise<{ id: string }> {
    const ctx = requireTenantContext();
    const brandId = getBrandId() ?? null;
    return this.repo.upsertModifierGroup({
      ...(input.id ? { id: input.id } : {}),
      tenantId: ctx.tenantId,
      brandId,
      name: input.name,
      minSelectable: input.minSelectable,
      maxSelectable: input.maxSelectable,
      isRequired: input.isRequired,
    });
  }
}
