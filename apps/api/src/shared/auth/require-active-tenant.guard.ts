import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { getTenantContext } from '@resto/db';
import { TENANT_REPOSITORY, type TenantRepository } from '../../contexts/tenancy/domain/ports';

// OQ-3: enforce per-route via decorator; middleware stays informational so
// /internal/* routes remain reachable on suspended tenants.
@Injectable()
export class RequireActiveTenantGuard implements CanActivate {
  constructor(@Inject(TENANT_REPOSITORY) private readonly repo: TenantRepository) {}

  async canActivate(_ctx: ExecutionContext): Promise<boolean> {
    // If no tenant resolved by middleware, defer to the controller body
    // (which 404s via requireTenantOr404). The guard's job is read
    // enforcement, not tenant-resolution validation.
    if (!getTenantContext()) return true;
    const tenant = await this.repo.findCurrentTenant();
    if (!tenant) return true;
    // AUDIT #21: every non-active status goes dark on the public read path.
    // 404 (not 403) so a suspended/archived tenant's existence stays hidden,
    // matching how a brandless host already collapses to 404.
    if (!tenant.isPubliclyServable()) {
      throw new NotFoundException('No tenant resolved for this host.');
    }
    return true;
  }
}
