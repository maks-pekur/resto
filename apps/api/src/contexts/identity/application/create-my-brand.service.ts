import { Inject, Injectable } from '@nestjs/common';
import { runInTenantContext } from '@resto/db';
import type { BrandSlug, TenantId } from '@resto/domain';
import { ProvisionBrandService } from '../../tenancy/application/provision-brand.service';
import type { BrandSnapshot } from '../../tenancy/domain/brand.aggregate';
import { BrandSlugConflictError } from '../domain/brand-errors';

export interface CreateMyBrandInput {
  readonly tenantId: TenantId;
  readonly slug: BrandSlug;
  readonly displayName: string;
}

@Injectable()
export class CreateMyBrandService {
  constructor(@Inject(ProvisionBrandService) private readonly provision: ProvisionBrandService) {}

  async execute(input: CreateMyBrandInput): Promise<BrandSnapshot> {
    return runInTenantContext({ tenantId: input.tenantId }, async () => {
      try {
        return await this.provision.execute({
          tenantId: input.tenantId,
          slug: input.slug,
          displayName: input.displayName,
        });
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw new BrandSlugConflictError(input.slug);
        }
        throw err;
      }
    });
  }
}

const isUniqueViolation = (err: unknown): boolean => {
  if (typeof err !== 'object' || err === null) return false;
  const e = err as { code?: string; cause?: unknown };
  if (e.code === '23505') return true;
  return isUniqueViolation(e.cause);
};
