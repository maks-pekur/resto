import { Inject, Injectable, Logger } from '@nestjs/common';
import { currencyForCountry } from '@resto/domain';
import { ENV_TOKEN } from '../../../config/config.module';
import type { Env } from '../../../config/env.schema';
import { guestHostForTenant } from '../../../shared/guest-links';
import { Tenant, type TenantSnapshot } from '../domain/tenant.aggregate';
import { TENANT_REPOSITORY, type TenantRepository } from '../domain/ports';
import { TenantSlugArchivedError } from '../domain/errors';
import type { ProvisionTenantInput } from './dto';
import { SeedPresetRolesService } from '../../identity/application/roles/seed-preset-roles.service';

@Injectable()
export class ProvisionTenantService {
  private readonly logger = new Logger(ProvisionTenantService.name);

  constructor(
    @Inject(TENANT_REPOSITORY) private readonly repo: TenantRepository,
    @Inject(SeedPresetRolesService) private readonly seedPresets: SeedPresetRolesService,
    @Inject(ENV_TOKEN) private readonly env: Env,
  ) {}

  async execute(input: ProvisionTenantInput): Promise<TenantSnapshot> {
    const existing = await this.repo.findBySlug(input.slug);
    if (existing) {
      if (existing.status === 'archived') {
        throw new TenantSlugArchivedError(input.slug);
      }
      this.logger.log(
        { slug: input.slug, tenantId: existing.id },
        'Tenant already provisioned — returning existing snapshot.',
      );
      return existing;
    }

    // D-35: currency is never a caller input — derive it from the validated
    // country. Tenant.provision derives the same value internally; logging
    // it here up front makes a market/currency mismatch visible before the
    // aggregate is even constructed.
    this.logger.log(
      {
        slug: input.slug,
        country: input.country,
        defaultCurrency: currencyForCountry(input.country),
      },
      'Deriving default currency from country for provisioning.',
    );

    const tenant = Tenant.provision({
      slug: input.slug,
      displayName: input.displayName,
      country: input.country,
      ...(input.locale !== undefined ? { locale: input.locale } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      primaryDomainHostname: guestHostForTenant(this.env, { slug: input.slug }, null),
    });

    await this.repo.save(tenant);
    const snapshot = tenant.toSnapshot();
    this.logger.log({ slug: input.slug, tenantId: snapshot.id }, 'Tenant provisioned.');

    // D-07 (08.3): seed 3 preset roles; non-blocking — owner can still manage roles if this fails
    try {
      await this.seedPresets.execute({ tenantId: snapshot.id });
    } catch (err) {
      this.logger.warn(
        { err, tenantId: snapshot.id },
        'Preset role seeding failed — continuing provisioning',
      );
    }

    return snapshot;
  }
}
