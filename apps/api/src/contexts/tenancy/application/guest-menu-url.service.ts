import { Inject, Injectable } from '@nestjs/common';
import { ENV_TOKEN } from '../../../config/config.module';
import type { Env } from '../../../config/env.schema';
import { TENANT_REPOSITORY, type TenantRepository } from '../domain/ports';
import type { TenantSnapshot } from '../domain/tenant.aggregate';

export interface BuildGuestMenuUrlInput {
  readonly tenant: TenantSnapshot;
  /** The code's own secret, not the table id: a copied address must not name a table. */
  readonly qrToken: string;
}

/**
 * The one place the guest sticker URL shape is written down (CONTEXT D-21) — `resolveByCustomerHost`
 * (`tenant-resolver.service.ts`) run in reverse, so the two can never disagree. Lives here because it
 * must: `apps/admin/src/env.ts` exposes no menu host and no apex to the browser bundle, by design, and
 * a tenant on a verified custom domain has a host no client-side formula derives.
 *
 * `GUEST_APEX_DOMAIN` is `.optional()` in `env.schema.ts` and the shared e2e harness
 * (`with-real-stack.setup.ts`) does not set it — every table this service resolves for a tenant with
 * no custom domain throws without it. Any e2e that creates or lists a zone over HTTP runs a table
 * through here, so `table-zones.e2e.spec.ts` and `table-location-availability.e2e.spec.ts` each set
 * `process.env.GUEST_APEX_DOMAIN = 'menu.resto.app'` before calling `startRealStack` — matching the
 * apex `host-resolution.e2e.spec.ts` already seeds its `tenant_domains` rows against — or seed a
 * primary verified custom domain instead (the longer path; only one fixture should ever need it).
 */
@Injectable()
export class GuestMenuUrlService {
  constructor(
    @Inject(TENANT_REPOSITORY) private readonly tenantRepo: TenantRepository,
    @Inject(ENV_TOKEN) private readonly env: Env,
  ) {}

  async execute(input: BuildGuestMenuUrlInput): Promise<string> {
    const host = await this.#resolveGuestHost(input.tenant);
    return `https://${host}/t/${input.qrToken}`;
  }

  async #resolveGuestHost(tenant: TenantSnapshot): Promise<string> {
    const domains = await this.tenantRepo.listDomains(tenant.id);
    const primaryVerifiedCustom = domains.find(
      (domain) => domain.kind === 'custom' && domain.isPrimary && domain.verifiedAt !== null,
    );
    if (primaryVerifiedCustom) return primaryVerifiedCustom.domain;

    const apex = this.env.GUEST_APEX_DOMAIN;
    if (!apex) {
      throw new Error(
        `Cannot build a guest menu URL for tenant "${tenant.slug}": GUEST_APEX_DOMAIN is not set ` +
          'and the tenant has no primary verified custom domain. A sticker with a broken host is ' +
          'worse than a failed download.',
      );
    }
    return `${tenant.slug}.${apex}`;
  }
}
