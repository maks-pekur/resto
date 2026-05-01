import { Inject, Injectable } from '@nestjs/common';
import { TenantId } from '@resto/domain';
import { TENANT_REPOSITORY, type TenantRepository } from '../domain/ports';
import { TenantNotFoundError } from '../domain/errors';

@Injectable()
export class ArchiveTenantService {
  constructor(@Inject(TENANT_REPOSITORY) private readonly repo: TenantRepository) {}

  async execute(rawId: string): Promise<void> {
    const id = TenantId.parse(rawId);
    const tenant = await this.repo.findById(id);
    if (!tenant) {
      throw new TenantNotFoundError(rawId);
    }
    tenant.archive();
    await this.repo.save(tenant);
  }
}
