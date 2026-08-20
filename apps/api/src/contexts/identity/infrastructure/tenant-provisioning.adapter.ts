import { Inject, Injectable } from '@nestjs/common';
import { COUNTRY_REGISTRY, type CountryCodeValue } from '@resto/domain';
import { ProvisionTenantService } from '../../tenancy/application/provision-tenant.service';
import type {
  IdentityTenantView,
  ProvisionIdentityTenantInput,
  TenantProvisioningPort,
} from '../application/ports/tenant-provisioning.port';

// D-35/D-13: ProvisionTenantService now takes `country`, not a caller-supplied
// currency (plan 03/10.2-03). `ProvisionIdentityTenantInput` still carries
// `defaultCurrency` — plan 13 owns the full country-first signup rewrite
// (dto.ts, signup.service.ts, this port). Until then, derive `country` from
// the closed, bijective COUNTRY_REGISTRY rather than guessing.
const countryForCurrency = (currency: string): CountryCodeValue | undefined =>
  (Object.keys(COUNTRY_REGISTRY) as CountryCodeValue[]).find(
    (code) => COUNTRY_REGISTRY[code].currency === currency,
  );

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
    const country = countryForCurrency(input.defaultCurrency);
    if (!country) {
      throw new Error(`No supported country maps to currency "${input.defaultCurrency}".`);
    }
    const snapshot = await this.provisioner.execute({
      slug: input.slug,
      displayName: input.displayName,
      country,
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
