import { Inject, Injectable } from '@nestjs/common';
import { requireLocationContext, requireTenantContext } from '@resto/db';
import { CATALOG_REPOSITORY, type CatalogRepository } from '../../domain/ports';
import type { StopOptionInput } from '../dto';

@Injectable()
export class OptionStopListService {
  constructor(@Inject(CATALOG_REPOSITORY) private readonly repo: CatalogRepository) {}

  async stop(input: StopOptionInput): Promise<{ id: string }> {
    const ctx = requireTenantContext();
    const locationId = requireLocationContext();
    return this.repo.addOptionToStopList({
      optionId: input.optionId,
      tenantId: ctx.tenantId,
      locationId,
      reason: input.reason,
      stoppedByUserId: null,
    });
  }

  async unstop(optionId: string): Promise<{ removed: boolean }> {
    requireTenantContext();
    const locationId = requireLocationContext();
    return this.repo.removeOptionFromStopList({ optionId, locationId });
  }
}
