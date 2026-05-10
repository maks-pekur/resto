import { Inject, Injectable } from '@nestjs/common';
import { ProvisionTenantService } from '../../tenancy/application/provision-tenant.service';
import type {
  IdentityTenantView,
  ProvisionIdentityTenantInput,
  TenantProvisioningPort,
} from '../application/ports/tenant-provisioning.port';

/**
 * Bridges identity → tenancy without leaking tenancy's domain types.
 * Calls `ProvisionTenantService` (public application surface of tenancy)
 * and projects the returned `TenantSnapshot` into the identity-side
 * `IdentityTenantView`.
 */
@Injectable()
export class TenantProvisioningAdapter implements TenantProvisioningPort {
  constructor(
    @Inject(ProvisionTenantService) private readonly provisioner: ProvisionTenantService,
  ) {}

  async provision(input: ProvisionIdentityTenantInput): Promise<IdentityTenantView> {
    const snapshot = await this.provisioner.execute({
      slug: input.slug,
      displayName: input.displayName,
      defaultCurrency: input.defaultCurrency,
      locale: input.locale ?? 'en',
    });
    return {
      id: snapshot.id,
      slug: snapshot.slug,
      displayName: snapshot.displayName,
      status: snapshot.status,
      primaryDomainHostname: snapshot.primaryDomain.domain,
    };
  }
}
