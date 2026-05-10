import { Inject, Injectable, Logger } from '@nestjs/common';
import { TenantId } from '@resto/domain';
import { TENANT_REPOSITORY, type TenantRepository } from '../domain/ports';
import { TenantNotFoundError } from '../domain/errors';
import {
  IDENTITY_REVOCATION_PORT,
  type IdentityRevocationPort,
} from './ports/identity-revocation.port';

@Injectable()
export class ArchiveTenantService {
  private readonly logger = new Logger(ArchiveTenantService.name);

  constructor(
    @Inject(TENANT_REPOSITORY) private readonly repo: TenantRepository,
    @Inject(IDENTITY_REVOCATION_PORT) private readonly revoker: IdentityRevocationPort,
  ) {}

  async execute(rawId: string): Promise<void> {
    const id = TenantId.parse(rawId);
    const tenant = await this.repo.findById(id);
    if (!tenant) {
      throw new TenantNotFoundError(rawId);
    }
    const result = await this.revoker.revokeAllSessionsForTenant(id);
    this.logger.log(
      { tenantId: id, revokedSessionsCount: result.revokedSessionsCount },
      'Revoked operator sessions ahead of tenant archive',
    );
    tenant.archive();
    await this.repo.save(tenant);
  }
}
