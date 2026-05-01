import { Inject, Injectable } from '@nestjs/common';
import { requireTenantContext } from '@resto/db';
import { TenantId } from '@resto/domain';
import { MENU_VERSION_PORT, type MenuVersionPort } from '../domain/ports';

/**
 * Bumps the per-tenant menu version. Cache keys depend on the version,
 * so the next read for this tenant misses cache and re-loads from DB.
 */
@Injectable()
export class PublishMenuService {
  constructor(@Inject(MENU_VERSION_PORT) private readonly versions: MenuVersionPort) {}

  async execute(): Promise<{ tenantId: string; version: number }> {
    const ctx = requireTenantContext();
    const tenantId = TenantId.parse(ctx.tenantId);
    const version = await this.versions.bump(tenantId);
    return { tenantId, version };
  }
}
