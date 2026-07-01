import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { BrandId, type BrandSlug, type TenantId } from '@resto/domain';
import { BRAND_REPOSITORY, type BrandRepository } from '../domain/ports';
import type { BrandSnapshot } from '../domain/brand.aggregate';

const PRIMARY_DOMAIN_SUFFIX = 'menu.resto.app';

export interface ProvisionBrandInput {
  readonly tenantId: TenantId;
  readonly slug: BrandSlug;
  readonly displayName: string;
}

@Injectable()
export class ProvisionBrandService {
  private readonly logger = new Logger(ProvisionBrandService.name);

  constructor(@Inject(BRAND_REPOSITORY) private readonly brands: BrandRepository) {}

  async execute(input: ProvisionBrandInput): Promise<BrandSnapshot> {
    const existing = await this.brands.findByTenantAndSlug(input.tenantId, input.slug);
    if (existing) {
      this.logger.log(
        { tenantId: input.tenantId, slug: input.slug, brandId: existing.id },
        'Brand already provisioned — returning existing snapshot.',
      );
      return existing;
    }

    const snapshot: BrandSnapshot = {
      id: BrandId.parse(randomUUID()),
      tenantId: input.tenantId,
      slug: input.slug,
      displayName: input.displayName,
      status: 'active',
      theme: null,
      paymentProvider: 'stripe',
      accountType: null,
      defaultCurrency: null,
      stripeAccountId: null,
      stripeChargesEnabled: false,
      stripePayoutsEnabled: false,
      stripeOnboardingStatus: 'not_started',
      stripeRequirementsDue: null,
    };

    const primaryDomainHostname = `${input.slug}.${PRIMARY_DOMAIN_SUFFIX}`;
    await this.brands.save(snapshot, primaryDomainHostname);
    this.logger.log(
      { tenantId: input.tenantId, slug: input.slug, brandId: snapshot.id },
      'Default brand provisioned.',
    );
    return snapshot;
  }
}
