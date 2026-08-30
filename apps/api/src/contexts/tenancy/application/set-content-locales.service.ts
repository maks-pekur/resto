import { Inject, Injectable, Logger } from '@nestjs/common';
import { requireTenantContext } from '@resto/db';
import { ContentLocalesSchema, ContentLocaleSchema, TenantId } from '@resto/domain';
import { TENANT_REPOSITORY, type TenantRepository } from '../domain/ports';
import { TenantNotFoundError } from '../domain/errors';
import { Tenant, type TenantSnapshot } from '../domain/tenant.aggregate';
import { DefaultLocaleNotSupportedError } from '../domain/errors';

export interface SetContentLocalesInput {
  readonly defaultLocale: string;
  readonly contentLocales: readonly string[];
}

@Injectable()
export class SetContentLocalesService {
  private readonly logger = new Logger(SetContentLocalesService.name);

  constructor(@Inject(TENANT_REPOSITORY) private readonly tenants: TenantRepository) {}

  async execute(input: SetContentLocalesInput): Promise<TenantSnapshot> {
    const ctx = requireTenantContext();
    const tenantId = TenantId.parse(ctx.tenantId);

    const defaultLocale = ContentLocaleSchema.parse(input.defaultLocale);
    const contentLocales = ContentLocalesSchema.parse([...input.contentLocales]);

    // The default is the fallback every guest surface lands on, so it cannot be a language the
    // tenant does not publish in.
    if (!contentLocales.includes(defaultLocale)) {
      throw new DefaultLocaleNotSupportedError(defaultLocale);
    }

    const snapshot = await this.tenants.findById(tenantId);
    if (!snapshot) throw new TenantNotFoundError(tenantId);

    const next: TenantSnapshot = {
      ...snapshot,
      locale: defaultLocale,
      contentLocales,
      updatedAt: new Date(),
    };
    await this.tenants.save(Tenant.fromSnapshot(next));

    this.logger.log({ tenantId, defaultLocale, contentLocales }, 'Tenant content locales set.');
    return next;
  }
}
