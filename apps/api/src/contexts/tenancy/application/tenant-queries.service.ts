import { Inject, Injectable } from '@nestjs/common';
import { TenantId, TenantSlug } from '@resto/domain';
import type { TenantSnapshot } from '../domain/tenant.aggregate';
import type { TenantDomain } from '../domain/tenant-domain';
import { TENANT_REPOSITORY, type TenantRepository } from '../domain/ports';
import { TenantNotFoundError } from '../domain/errors';

@Injectable()
export class TenantQueriesService {
  constructor(@Inject(TENANT_REPOSITORY) private readonly repo: TenantRepository) {}

  async getBySlug(rawSlug: string): Promise<TenantSnapshot> {
    const slug = TenantSlug.parse(rawSlug);
    const tenant = await this.repo.findBySlug(slug);
    if (!tenant) {
      throw new TenantNotFoundError(rawSlug);
    }
    return tenant.toSnapshot();
  }

  async getById(rawId: string): Promise<TenantSnapshot> {
    const id = TenantId.parse(rawId);
    const tenant = await this.repo.findById(id);
    if (!tenant) {
      throw new TenantNotFoundError(rawId);
    }
    return tenant.toSnapshot();
  }

  async listDomains(rawId: string): Promise<TenantDomain[]> {
    const id = TenantId.parse(rawId);
    const tenant = await this.repo.findById(id);
    if (!tenant) {
      throw new TenantNotFoundError(rawId);
    }
    return this.repo.listDomains(id);
  }
}
