import { Inject, Injectable, Logger } from '@nestjs/common';
import { requireTenantContext } from '@resto/db';
import { TenantId, TenantTheme } from '@resto/domain';
import {
  BRAND_MEDIA_PORT,
  TENANT_REPOSITORY,
  type BrandMediaPort,
  type TenantRepository,
} from '../domain/ports';
import { BrandLogoNotOwnedError, TenantNotFoundError } from '../domain/errors';
import { Tenant, type TenantSnapshot } from '../domain/tenant.aggregate';
import type { UpdateBrandRequest } from './dto';

@Injectable()
export class UpdateBrandService {
  private readonly logger = new Logger(UpdateBrandService.name);

  constructor(
    @Inject(TENANT_REPOSITORY) private readonly tenants: TenantRepository,
    @Inject(BRAND_MEDIA_PORT) private readonly media: BrandMediaPort,
  ) {}

  async execute(input: UpdateBrandRequest): Promise<TenantSnapshot> {
    const ctx = requireTenantContext();
    const tenantId = TenantId.parse(ctx.tenantId);

    const snapshot = await this.tenants.findById(tenantId);
    if (!snapshot) throw new TenantNotFoundError(tenantId);

    const theme = await this.resolveTheme(snapshot, input, tenantId);

    // Every field is optional: the screen saves one card at a time, and an absent key must leave
    // what is stored alone rather than blank it.
    const next: TenantSnapshot = {
      ...snapshot,
      displayName: input.displayName ?? snapshot.displayName,
      description: input.description === undefined ? snapshot.description : input.description,
      socials: input.socials ?? snapshot.socials,
      contacts: input.contacts ?? snapshot.contacts,
      openingHours: input.openingHours === undefined ? snapshot.openingHours : input.openingHours,
      wifi: input.wifi === undefined ? snapshot.wifi : input.wifi,
      theme,
      updatedAt: new Date(),
    };
    await this.tenants.save(Tenant.fromSnapshot(next));

    this.logger.log({ tenantId }, 'Tenant brand updated.');
    return next;
  }

  private async resolveTheme(
    snapshot: TenantSnapshot,
    input: UpdateBrandRequest,
    tenantId: TenantId,
  ): Promise<TenantTheme | null> {
    if (input.logoS3Key === undefined && input.coverS3Key === undefined) return snapshot.theme;

    const logoUrl = await this.resolveImage(input.logoS3Key, tenantId);
    const coverUrl = await this.resolveImage(input.coverS3Key, tenantId);

    return TenantTheme.parse({
      ...(snapshot.theme ?? {}),
      ...(logoUrl === undefined ? {} : { logoUrl }),
      ...(coverUrl === undefined ? {} : { coverUrl }),
    });
  }

  private async resolveImage(
    s3Key: string | null | undefined,
    tenantId: TenantId,
  ): Promise<string | null | undefined> {
    if (s3Key === undefined) return undefined;
    if (s3Key === null) return null;
    // The key is echoed back by the browser, so it is only trustworthy after the prefix the
    // presign service put there is checked against the caller's own tenant.
    if (!s3Key.startsWith(`tenant/${tenantId}/brand/`)) {
      throw new BrandLogoNotOwnedError(tenantId);
    }
    return this.media.publish(s3Key);
  }
}
