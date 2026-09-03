import { Inject, Injectable } from '@nestjs/common';
import { requireTenantContext } from '@resto/db';
import { CATALOG_REPOSITORY, type CatalogRepository } from '../../domain/ports';
import type { UpsertModifierGroupInput } from '../dto';

@Injectable()
export class UpsertModifierGroupService {
  constructor(@Inject(CATALOG_REPOSITORY) private readonly repo: CatalogRepository) {}

  async execute(input: UpsertModifierGroupInput): Promise<{ id: string }> {
    const ctx = requireTenantContext();
    return this.repo.upsertModifierGroup({
      ...(input.id ? { id: input.id } : {}),
      tenantId: ctx.tenantId,
      name: input.name,
      display: input.display,
      behaviour: input.behaviour,
      isRequired: input.isRequired,
    });
  }
}
