import { Inject, Injectable, Logger } from '@nestjs/common';
import { TenantId } from '@resto/domain';
import { TENANT_REPOSITORY, type TenantRepository } from '../domain/ports';
import { TenantNotFoundError } from '../domain/errors';
import { Tenant, type TenantSnapshot } from '../domain/tenant.aggregate';

@Injectable()
export class SuspendTenantService {
  private readonly logger = new Logger(SuspendTenantService.name);

  constructor(@Inject(TENANT_REPOSITORY) private readonly repo: TenantRepository) {}

  async suspend(input: { tenantId: string; requestedBy: string }): Promise<TenantSnapshot> {
    const id = TenantId.parse(input.tenantId);
    const snapshot = await this.repo.findById(id);
    if (!snapshot) {
      throw new TenantNotFoundError(input.tenantId);
    }
    const tenant = Tenant.fromSnapshot(snapshot);
    tenant.suspend(input.requestedBy);
    await this.repo.save(tenant);
    this.logger.warn({ tenantId: id, requestedBy: input.requestedBy }, 'Tenant suspended');
    return tenant.toSnapshot();
  }

  async resume(input: { tenantId: string }): Promise<TenantSnapshot> {
    const id = TenantId.parse(input.tenantId);
    const snapshot = await this.repo.findById(id);
    if (!snapshot) {
      throw new TenantNotFoundError(input.tenantId);
    }
    const tenant = Tenant.fromSnapshot(snapshot);
    tenant.resume();
    await this.repo.save(tenant);
    this.logger.log({ tenantId: id }, 'Tenant resumed');
    return tenant.toSnapshot();
  }
}
