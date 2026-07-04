import { Inject, Injectable, Logger } from '@nestjs/common';
import { Tenant, type TenantSnapshot } from '../domain/tenant.aggregate';
import { TENANT_REPOSITORY, type TenantRepository } from '../domain/ports';
import { Currency } from '@resto/domain';
import { TenantSlugArchivedError } from '../domain/errors';
import type { ProvisionTenantInput } from './dto';
import { SeedPresetRolesService } from '../../identity/application/seed-preset-roles.service';

const PRIMARY_DOMAIN_SUFFIX = 'menu.resto.app';

@Injectable()
export class ProvisionTenantService {
  private readonly logger = new Logger(ProvisionTenantService.name);

  constructor(
    @Inject(TENANT_REPOSITORY) private readonly repo: TenantRepository,
    @Inject(SeedPresetRolesService) private readonly seedPresets: SeedPresetRolesService,
  ) {}

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
    const snapshot = tenant.toSnapshot();
    this.logger.log({ slug: input.slug, tenantId: snapshot.id }, 'Tenant provisioned.');

    // D-07 (08.3): seed 3 preset roles; non-blocking — owner can still manage roles if this fails
    try {
      await this.seedPresets.execute({ organizationId: snapshot.id });
    } catch (err) {
      this.logger.warn(
        { err, tenantId: snapshot.id },
        'Preset role seeding failed — continuing provisioning',
      );
    }

    return snapshot;
  }
}
