import { Inject, Injectable, Logger } from '@nestjs/common';
import { requireTenantContext } from '@resto/db';
import { TenantId } from '@resto/domain';
import {
  CATALOG_REPOSITORY,
  IMAGE_URL_PORT,
  type CatalogRepository,
  type ImageUrlPort,
} from '../../domain/ports';

@Injectable()
export class PublishMenuService {
  private readonly logger = new Logger(PublishMenuService.name);

  constructor(
    @Inject(CATALOG_REPOSITORY) private readonly repo: CatalogRepository,
    @Inject(IMAGE_URL_PORT) private readonly media: ImageUrlPort,
  ) {}

  async execute(): Promise<{ tenantId: string; version: number }> {
    const ctx = requireTenantContext();
    const tenantId = TenantId.parse(ctx.tenantId);
    const { version } = await this.doPublish(tenantId);
    return { tenantId, version };
  }

  async doPublish(tenantId: TenantId | string): Promise<{ version: number }> {
    const id = TenantId.parse(tenantId);
    // Publishing the media before the version: a guest must never resolve a menu
    // version whose photos are not yet readable. Deliberately outside the publish
    // transaction — an S3 round-trip per photo does not belong in a DB tx.
    await this.publishPhotos(id);
    const result = await this.repo.finalizeMenuPublish({ tenantId: id });
    this.logger.log(
      { tenantId: id, version: result.version, isFirstPublish: result.isFirstPublish },
      result.isFirstPublish ? 'Menu first publish committed.' : 'Menu republish committed.',
    );
    return { version: result.version };
  }

  private async publishPhotos(tenantId: TenantId): Promise<void> {
    const keys = await this.repo.listPublishedPhotoKeys();
    if (keys.length === 0) return;
    await Promise.all(keys.map((key) => this.media.publishPublicCopy(key)));
    this.logger.log({ tenantId, photos: keys.length }, 'Published menu photos to public media.');
  }
}
