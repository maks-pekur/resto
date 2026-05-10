import { Controller, ForbiddenException, Get, Inject } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TenantId } from '@resto/domain';
import { ListMyBrandsService } from '../../application/list-my-brands.service';
import { CurrentOperator } from './decorators/current-principal.decorator';
import { Permissions } from './decorators/permissions.decorator';
import type { OperatorPrincipal } from '../../domain/principal';

interface MeBrandsResponseBrand {
  readonly id: string;
  readonly slug: string;
  readonly displayName: string;
}

export interface MeBrandsResponse {
  readonly brands: readonly MeBrandsResponseBrand[];
  readonly canViewAllBrands: boolean;
}

@ApiTags('identity')
@Controller('v1/me')
export class MeBrandsController {
  constructor(@Inject(ListMyBrandsService) private readonly service: ListMyBrandsService) {}

  @Get('brands')
  @Permissions({ tenant: ['read'] })
  async getBrands(@CurrentOperator() operator: OperatorPrincipal): Promise<MeBrandsResponse> {
    if (!operator.tenantId) {
      throw new ForbiddenException({ code: 'auth.no_active_tenant' });
    }
    const result = await this.service.execute({
      userId: operator.userId,
      tenantId: TenantId.parse(operator.tenantId),
    });
    return {
      brands: result.brands.map((b) => ({ id: b.id, slug: b.slug, displayName: b.displayName })),
      canViewAllBrands: result.canViewAllBrands,
    };
  }
}
