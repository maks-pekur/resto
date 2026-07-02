import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
} from '@nestjs/common';
import { ApiForbiddenResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { TenantId } from '@resto/domain';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import type { FastifyRequest } from 'fastify';
import { RestoZodValidationPipe } from '../../../../shared/api/zod-validation.pipe';
import { wrapWith } from '../../../../shared/api/wrap';
import { Permissions, RequiresTenantContext } from '../../../../shared/auth';
import { SetActiveBrandService } from '../../application/set-active-brand.service';
import { BrandOutOfScopeError } from '../../domain/errors';
import type { OperatorPrincipal } from '../../domain/principal';
import { CurrentOperator } from './decorators/current-principal.decorator';
import { mapIdentityError } from './error-mapping';
import { ProblemDetailsDto } from '../../../../shared/api/problem-details.dto';

const SetActiveBrandInputSchema = z.object({
  brandId: z.string().uuid(),
});

class SetActiveBrandInputDto extends createZodDto(SetActiveBrandInputSchema) {}

const SetActiveBrandResponseSchema = z.object({
  slug: z.string(),
});

class SetActiveBrandResponseDto extends createZodDto(SetActiveBrandResponseSchema) {}

const mapError = (err: unknown): unknown => {
  if (err instanceof BrandOutOfScopeError) {
    return new ForbiddenException({ code: err.code, message: err.message });
  }
  return mapIdentityError(err);
};

const wrap = wrapWith(mapError);

@ApiTags('identity')
@Controller('v1/me')
export class SetActiveBrandController {
  constructor(@Inject(SetActiveBrandService) private readonly service: SetActiveBrandService) {}

  @Post('set-active-brand')
  @HttpCode(HttpStatus.OK)
  @RequiresTenantContext()
  @Permissions({ tenant: ['read'] })
  @ApiOkResponse({ type: SetActiveBrandResponseDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  async setActiveBrand(
    @Req() req: FastifyRequest,
    @CurrentOperator() operator: OperatorPrincipal,
    @Body(new RestoZodValidationPipe(SetActiveBrandInputDto)) input: SetActiveBrandInputDto,
  ): Promise<SetActiveBrandResponseDto> {
    const { tenantId: rawTenantId } = operator;
    if (!rawTenantId) {
      throw new ForbiddenException({ code: 'auth.no_active_tenant' });
    }
    const sessionToken = (req as FastifyRequest & { sessionToken?: string }).sessionToken;
    if (!sessionToken) {
      throw new ForbiddenException({ code: 'auth.session_missing' });
    }
    const tenantId = TenantId.parse(rawTenantId);
    return wrap(() =>
      this.service.execute({
        userId: operator.userId,
        tenantId,
        baseRole: operator.baseRole,
        brandId: input.brandId,
        sessionToken,
      }),
    );
  }
}
