import { Inject, Injectable } from '@nestjs/common';
import { requireTenantContext } from '@resto/db';
import { CATALOG_REPOSITORY, type CatalogRepository } from '../domain/ports';
import type { UpsertModifierInput } from './dto';

@Injectable()
export class UpsertModifierService {
  constructor(@Inject(CATALOG_REPOSITORY) private readonly repo: CatalogRepository) {}

  async execute(input: UpsertModifierInput): Promise<{ id: string }> {
    const ctx = requireTenantContext();
    return this.repo.upsertModifier({
      ...(input.id ? { id: input.id } : {}),
      tenantId: ctx.tenantId,
      name: input.name,
      minSelectable: input.minSelectable,
      maxSelectable: input.maxSelectable,
      isRequired: input.isRequired,
    });
  }
}
