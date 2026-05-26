import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { getTenantContext } from '@resto/db';
import { TENANT_REPOSITORY, type TenantRepository } from '../../contexts/tenancy/domain/ports';
import { TenantSuspendedError } from '../../contexts/tenancy/domain/errors';
import { mapDomainError } from '../../contexts/tenancy/interfaces/http/error-mapping';

// OQ-3: enforce per-route via decorator; middleware stays informational so
// /internal/* routes remain reachable on suspended tenants.
@Injectable()
export class RequireActiveTenantGuard implements CanActivate {
  constructor(@Inject(TENANT_REPOSITORY) private readonly repo: TenantRepository) {}

  async canActivate(_ctx: ExecutionContext): Promise<boolean> {
    // If no tenant resolved by middleware, defer to the controller body
    // (which 404s via requireTenantOr404). The guard's job is suspension
    // enforcement, not tenant-resolution validation.
    if (!getTenantContext()) return true;
    const tenant = await this.repo.findCurrentTenant();
    if (!tenant) return true;
    const snapshot = tenant.toSnapshot();
    if (snapshot.status === 'suspended') {
      // Map domain error to ForbiddenException here — ProblemDetailsFilter is
      // generic and only knows HttpException; the guard runs outside any
      // wrapWith(mapDomainError) controller body so we map inline.
      throw mapDomainError(new TenantSuspendedError(snapshot.id));
    }
    return true;
  }
}
