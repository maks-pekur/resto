import { Inject, Injectable, Logger } from '@nestjs/common';
import { Tenant, type TenantSnapshot } from '../domain/tenant.aggregate';
import {
  STRIPE_CONNECT_PORT,
  TENANT_REPOSITORY,
  type StripeConnectPort,
  type TenantRepository,
} from '../domain/ports';
import type { ProvisionTenantInput } from './dto';

const PRIMARY_DOMAIN_SUFFIX = 'menu.resto.app';

/**
 * Provision a tenant.
 *
 * Idempotent: calling with a slug that already maps to an `active`
 * tenant returns that tenant unchanged, with no new outbox event.
 * Returns the up-to-date snapshot.
 *
 * The domain and the outbox event are committed in the same DB
 * transaction (the repository owns that boundary), so a successful
 * return guarantees the broker will eventually deliver
 * `tenancy.tenant_provisioned.v1`.
 */
@Injectable()
export class ProvisionTenantService {
  private readonly logger = new Logger(ProvisionTenantService.name);

  constructor(
    @Inject(TENANT_REPOSITORY) private readonly repo: TenantRepository,
    @Inject(STRIPE_CONNECT_PORT) private readonly stripe: StripeConnectPort,
  ) {}

  async execute(input: ProvisionTenantInput): Promise<TenantSnapshot> {
    const existing = await this.repo.findBySlug(input.slug);
    if (existing) {
      const snapshot = existing.toSnapshot();
      if (snapshot.status === 'archived') {
        // Re-provisioning an archived slug is policy-deferred: surface a
        // domain error rather than silently reactivate. Caller picks a
        // new slug or runs an explicit "reactivate" flow (future ticket).
        throw new Error(
          `Tenant slug "${input.slug}" is archived. Choose a different slug or reactivate.`,
        );
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
      defaultCurrency: input.defaultCurrency,
      primaryDomainHostname: `${input.slug}.${PRIMARY_DOMAIN_SUFFIX}`,
    });

    // Stripe placeholder — adapter is no-op until MVP-2.
    await this.stripe.ensureExpressAccount({
      tenantId: tenant.toSnapshot().id,
      displayName: input.displayName,
    });

    await this.repo.save(tenant);
    this.logger.log({ slug: input.slug, tenantId: tenant.toSnapshot().id }, 'Tenant provisioned.');
    return tenant.toSnapshot();
  }
}
