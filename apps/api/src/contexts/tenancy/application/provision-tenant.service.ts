import { Inject, Injectable, Logger } from '@nestjs/common';
import { Tenant, type TenantSnapshot } from '../domain/tenant.aggregate';
import { TENANT_REPOSITORY, type TenantRepository } from '../domain/ports';
import { Currency } from '@resto/domain';
import { TenantSlugArchivedError } from '../domain/errors';
import type { ProvisionTenantInput } from './dto';

const PRIMARY_DOMAIN_SUFFIX = 'menu.resto.app';

@Injectable()
export class ProvisionTenantService {
  private readonly logger = new Logger(ProvisionTenantService.name);

  constructor(@Inject(TENANT_REPOSITORY) private readonly repo: TenantRepository) {}

  async execute(input: ProvisionTenantInput): Promise<TenantSnapshot> {
    const defaultCurrency = input.defaultCurrency as Currency;
    const existing = await this.repo.findBySlug(input.slug);
    if (existing) {
      const snapshot = existing.toSnapshot();
      if (snapshot.status === 'archived') {
        throw new TenantSlugArchivedError(input.slug);
      }
      this.logger.log(
        { slug: input.slug, tenantId: snapshot.id },
        'Tenant already provisioned — returning existing snapshot.',
      );
      return snapshot;
    }

    const tenant = Tenant.provision({
      slug: input.slug,
      displayName: input.displayName,
      locale: input.locale,
      defaultCurrency: defaultCurrency,
      primaryDomainHostname: `${input.slug}.${PRIMARY_DOMAIN_SUFFIX}`,
    });

    await this.repo.save(tenant);
    this.logger.log({ slug: input.slug, tenantId: tenant.toSnapshot().id }, 'Tenant provisioned.');
    return tenant.toSnapshot();
  }
}
