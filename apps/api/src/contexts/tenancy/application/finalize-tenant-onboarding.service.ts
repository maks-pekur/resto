import { Inject, Injectable } from '@nestjs/common';
import type { TenantId, TenantSlug } from '@resto/domain';
import { Tenant, type TenantSnapshot } from '../domain/tenant.aggregate';
import { TENANT_REPOSITORY, type TenantRepository } from '../domain/ports';
import { TenantNotFoundError } from '../domain/errors';

const PRIMARY_DOMAIN_SUFFIX = 'menu.resto.app';

export interface FinalizeTenantOnboardingInput {
  readonly tenantId: TenantId;
  readonly displayName: string;
  readonly slug: TenantSlug;
}

/**
 * D-30/D-31 (10.2 plan 13): the tenancy-side half of onboarding. Identity's
 * `FinalizeTenantSetupService` owns the caller-facing checks (session
 * resolution, the 409-on-not-pending guard, slug derivation); this service
 * only loads the aggregate, applies the transition and persists it —
 * `Tenant.finalizeSetup` re-asserts the same status guard as a safety net.
 */
@Injectable()
export class FinalizeTenantOnboardingService {
  constructor(@Inject(TENANT_REPOSITORY) private readonly repo: TenantRepository) {}

  async execute(input: FinalizeTenantOnboardingInput): Promise<TenantSnapshot> {
    const snapshot = await this.repo.findById(input.tenantId);
    if (!snapshot) {
      throw new TenantNotFoundError(input.tenantId);
    }
    const tenant = Tenant.fromSnapshot(snapshot);
    tenant.finalizeSetup({
      displayName: input.displayName,
      slug: input.slug,
      primaryDomainHostname: `${input.slug}.${PRIMARY_DOMAIN_SUFFIX}`,
    });
    await this.repo.save(tenant);
    return tenant.toSnapshot();
  }
}
