import { Inject, Injectable } from '@nestjs/common';
import type { TenantSnapshot } from '../../tenancy/domain/tenant.aggregate';
import { ProvisionTenantService } from '../../tenancy/application/provision-tenant.service';
import { TenantQueriesService } from '../../tenancy/application/tenant-queries.service';
import { FinalizeTenantOnboardingService } from '../../tenancy/application/finalize-tenant-onboarding.service';
import type {
  FinalizeIdentityTenantSetupInput,
  IdentityTenantView,
  ProvisionIdentityTenantInput,
  TenantProvisioningPort,
} from '../application/ports/tenant-provisioning.port';

const toView = (snapshot: TenantSnapshot): IdentityTenantView => ({
  id: snapshot.id,
  slug: snapshot.slug,
  displayName: snapshot.displayName,
  status: snapshot.status,
  primaryDomainHostname: snapshot.primaryDomain.domain,
});

/**
 * Bridges identity → tenancy without leaking tenancy's domain types.
 * Calls tenancy's public application services (`ProvisionTenantService`,
 * `TenantQueriesService`, `FinalizeTenantOnboardingService`) and projects
 * their returned `TenantSnapshot` into the identity-side `IdentityTenantView`.
 */
@Injectable()
export class TenantProvisioningAdapter implements TenantProvisioningPort {
  constructor(
    @Inject(ProvisionTenantService) private readonly provisioner: ProvisionTenantService,
    @Inject(TenantQueriesService) private readonly queries: TenantQueriesService,
    @Inject(FinalizeTenantOnboardingService)
    private readonly finalizer: FinalizeTenantOnboardingService,
  ) {}

  async provision(input: ProvisionIdentityTenantInput): Promise<IdentityTenantView> {
    const snapshot = await this.provisioner.execute({
      slug: input.slug,
      displayName: input.displayName,
      country: input.country,
      ...(input.locale !== undefined ? { locale: input.locale } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
    });
    return toView(snapshot);
  }

  async findById(id: string): Promise<IdentityTenantView | null> {
    const snapshot = await this.queries.findById(id);
    return snapshot ? toView(snapshot) : null;
  }

  async finalizeSetup(input: FinalizeIdentityTenantSetupInput): Promise<IdentityTenantView> {
    const snapshot = await this.finalizer.execute({
      tenantId: input.tenantId,
      displayName: input.displayName,
      slug: input.slug,
    });
    return toView(snapshot);
  }
}
