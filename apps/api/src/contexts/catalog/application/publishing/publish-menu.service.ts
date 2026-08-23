import { Inject, Injectable, Logger } from '@nestjs/common';
import { requireTenantContext } from '@resto/db';
import { TenantId } from '@resto/domain';
import { CATALOG_REPOSITORY, type CatalogRepository } from '../../domain/ports';

@Injectable()
export class PublishMenuService {
  private readonly logger = new Logger(PublishMenuService.name);

  constructor(@Inject(CATALOG_REPOSITORY) private readonly repo: CatalogRepository) {}

  async execute(): Promise<{ tenantId: string; version: number }> {
    const ctx = requireTenantContext();
    const tenantId = TenantId.parse(ctx.tenantId);
    const { version } = await this.doPublish(tenantId);
    return { tenantId, version };
  }

  async doPublish(tenantId: TenantId | string): Promise<{ version: number }> {
    const id = TenantId.parse(tenantId);
    const result = await this.repo.finalizeMenuPublish({ tenantId: id });
    this.logger.log(
      { tenantId: id, version: result.version, isFirstPublish: result.isFirstPublish },
      result.isFirstPublish ? 'Menu first publish committed.' : 'Menu republish committed.',
    );
    return { version: result.version };
  }
}
