import { Inject, Injectable } from '@nestjs/common';
import { TenantId, TenantSlug } from '@resto/domain';
import { TENANT_LOOKUP_PORT, type TenantLookupPort } from './ports/tenant-lookup.port';
import {
  TENANT_PROVISIONING_PORT,
  type TenantProvisioningPort,
} from './ports/tenant-provisioning.port';
import { findFreeSlug, slugify } from './signup.service';
import { TenantSetupNotPendingError } from '../domain/signup-errors';

export interface FinalizeTenantSetupInput {
  readonly tenantId: string;
  readonly displayName: string;
}

export interface FinalizeTenantSetupResult {
  readonly id: string;
  readonly slug: string;
  readonly displayName: string;
  readonly status: string;
}

/**
 * D-30/D-31: an owner names their restaurant once. The organization is
 * resolved from the session's `activeOrganizationId` (never a body
 * parameter — see the controller) and must be `'pending_setup'`; a second
 * call on an already-active organization is a 409, not a rename tool.
 */
@Injectable()
export class FinalizeTenantSetupService {
  constructor(
    @Inject(TENANT_PROVISIONING_PORT) private readonly provisioning: TenantProvisioningPort,
    @Inject(TENANT_LOOKUP_PORT) private readonly lookup: TenantLookupPort,
  ) {}

  async execute(input: FinalizeTenantSetupInput): Promise<FinalizeTenantSetupResult> {
    const current = await this.provisioning.findById(input.tenantId);
    if (current?.status !== 'pending_setup') {
      throw new TenantSetupNotPendingError(input.tenantId);
    }

    const base = slugify(input.displayName);
    const slug = await findFreeSlug(this.lookup, base);

    const result = await this.provisioning.finalizeSetup({
      tenantId: TenantId.parse(input.tenantId),
      displayName: input.displayName,
      slug: TenantSlug.parse(slug),
    });

    return {
      id: result.id,
      slug: result.slug,
      displayName: result.displayName,
      status: result.status,
    };
  }
}
