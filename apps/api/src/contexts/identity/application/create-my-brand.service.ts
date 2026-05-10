import { Inject, Injectable } from '@nestjs/common';
import type { BrandSlug, TenantId } from '@resto/domain';
import {
  BRAND_PROVISIONING_PORT,
  type BrandProvisioningPort,
  type IdentityBrandView,
} from './ports/brand-provisioning.port';

export interface CreateMyBrandInput {
  readonly tenantId: TenantId;
  readonly slug: BrandSlug;
  readonly displayName: string;
}

@Injectable()
export class CreateMyBrandService {
  constructor(@Inject(BRAND_PROVISIONING_PORT) private readonly brands: BrandProvisioningPort) {}

  async execute(input: CreateMyBrandInput): Promise<IdentityBrandView> {
    return this.brands.provision({
      tenantId: input.tenantId,
      slug: input.slug,
      displayName: input.displayName,
    });
  }
}
