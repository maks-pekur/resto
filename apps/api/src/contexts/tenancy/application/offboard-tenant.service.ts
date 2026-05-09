import { Inject, Injectable, Logger } from '@nestjs/common';
import { TenantId } from '@resto/domain';
import { ENV_TOKEN } from '../../../config/config.module';
import type { Env } from '../../../config/env.schema';
import { type TenantSnapshot } from '../domain/tenant.aggregate';
import { TENANT_REPOSITORY, type TenantRepository } from '../domain/ports';
import { TenantNotFoundError } from '../domain/errors';

const DEV_SALT_FALLBACK = 'dev-only-erasure-salt-32-chars-padding';

@Injectable()
export class OffboardTenantService {
  private readonly logger = new Logger(OffboardTenantService.name);

  constructor(
    @Inject(TENANT_REPOSITORY) private readonly repo: TenantRepository,
    @Inject(ENV_TOKEN) private readonly env: Env,
  ) {}

  async schedule(input: { tenantId: string; requestedBy: string }): Promise<TenantSnapshot> {
    const id = TenantId.parse(input.tenantId);
    const tenant = await this.repo.findById(id);
    if (!tenant) {
      throw new TenantNotFoundError(input.tenantId);
    }
    tenant.scheduleOffboarding(input.requestedBy);
    await this.repo.save(tenant);
    this.logger.log(
      { tenantId: id, requestedBy: input.requestedBy },
      'Tenant offboarding scheduled',
    );
    return tenant.toSnapshot();
  }

  async cancel(input: { tenantId: string }): Promise<TenantSnapshot> {
    const id = TenantId.parse(input.tenantId);
    const tenant = await this.repo.findById(id);
    if (!tenant) {
      throw new TenantNotFoundError(input.tenantId);
    }
    tenant.cancelOffboarding();
    await this.repo.save(tenant);
    this.logger.log({ tenantId: id }, 'Tenant offboarding cancelled');
    return tenant.toSnapshot();
  }

  async executeErasure(input: { tenantId: string }): Promise<TenantSnapshot> {
    const id = TenantId.parse(input.tenantId);
    const salt = this.env.AUDIT_ERASURE_SALT ?? DEV_SALT_FALLBACK;
    const snapshot = await this.repo.eraseTenant(id, salt);
    this.logger.warn({ tenantId: id }, 'Tenant erased (irreversible)');
    return snapshot;
  }

  async listScheduled(): Promise<readonly TenantSnapshot[]> {
    return this.repo.listScheduledForErasure();
  }
}
