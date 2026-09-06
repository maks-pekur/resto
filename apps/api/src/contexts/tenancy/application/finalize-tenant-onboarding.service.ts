import { Inject, Injectable } from '@nestjs/common';
import type { TenantId, TenantSlug } from '@resto/domain';
import { ENV_TOKEN } from '../../../config/config.module';
import type { Env } from '../../../config/env.schema';
import { guestHostForTenant } from '../../../shared/guest-links';
import { Tenant, type TenantSnapshot } from '../domain/tenant.aggregate';
import { TENANT_REPOSITORY, type TenantRepository } from '../domain/ports';
import { TenantNotFoundError } from '../domain/errors';

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
  constructor(
    @Inject(TENANT_REPOSITORY) private readonly repo: TenantRepository,
    @Inject(ENV_TOKEN) private readonly env: Env,
  ) {}

  async execute(input: FinalizeTenantOnboardingInput): Promise<TenantSnapshot> {
    const snapshot = await this.repo.findById(input.tenantId);
    if (!snapshot) {
      throw new TenantNotFoundError(input.tenantId);
    }
    const tenant = Tenant.fromSnapshot(snapshot);
    tenant.finalizeSetup({
      displayName: input.displayName,
      slug: input.slug,
      primaryDomainHostname: guestHostForTenant(this.env, { slug: input.slug }, null),
    });
    await this.repo.save(tenant);
    return tenant.toSnapshot();
  }
}
