import {
  Body,
  Controller,
  ForbiddenException,
  Get,
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
import { LocationNeutral, Permissions, RequiresTenantContext } from '../../../../shared/auth';
import { SetActiveLocationService } from '../../application/location-scope/set-active-location.service';
import {
  MEMBER_LOCATION_SCOPE_READER,
  type MemberLocationScopeReader,
} from '../../application/ports/member-location-scope-reader.port';
import { LocationAlreadyPinnedError, LocationOutOfScopeError } from '../../domain/errors';
import type { OperatorPrincipal } from '../../domain/principal';
import { CurrentOperator } from './decorators/current-principal.decorator';
import { mapIdentityError } from './error-mapping';
import { ProblemDetailsDto } from '../../../../shared/api/problem-details.dto';

const SetActiveLocationInputSchema = z.object({
  locationId: z.string().uuid().nullable(),
});

class SetActiveLocationInputDto extends createZodDto(SetActiveLocationInputSchema) {}

const SetActiveLocationResponseSchema = z.object({
  locationId: z.string().uuid().nullable(),
});

class SetActiveLocationResponseDto extends createZodDto(SetActiveLocationResponseSchema) {}

const PinnableLocationSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
});

const ListPinnableLocationsResponseSchema = z.object({
  locations: z.array(PinnableLocationSchema),
});

class ListPinnableLocationsResponseDto extends createZodDto(ListPinnableLocationsResponseSchema) {}

const mapError = (err: unknown): unknown => {
  if (err instanceof LocationAlreadyPinnedError) {
    return new ForbiddenException({ code: err.code, message: err.message });
  }
  if (err instanceof LocationOutOfScopeError) {
    return new ForbiddenException({ code: err.code, message: err.message });
  }
  return mapIdentityError(err);
};

const wrap = wrapWith(mapError);

@ApiTags('identity')
@LocationNeutral()
@Controller('v1/me')
export class SetActiveLocationController {
  constructor(
    @Inject(SetActiveLocationService) private readonly service: SetActiveLocationService,
    @Inject(MEMBER_LOCATION_SCOPE_READER) private readonly reader: MemberLocationScopeReader,
  ) {}

  @Post('set-active-location')
  @HttpCode(HttpStatus.OK)
  @RequiresTenantContext()
  @Permissions({ tenant: ['read'] })
  @ApiOkResponse({ type: SetActiveLocationResponseDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  async setActiveLocation(
    @Req() req: FastifyRequest,
    @CurrentOperator() operator: OperatorPrincipal,
    @Body(new RestoZodValidationPipe(SetActiveLocationInputDto)) input: SetActiveLocationInputDto,
  ): Promise<SetActiveLocationResponseDto> {
    const { tenantId: rawTenantId } = operator;
    if (!rawTenantId) {
      throw new ForbiddenException({ code: 'auth.no_active_tenant' });
    }
    const sessionToken = req.sessionToken;
    if (!sessionToken) {
      throw new ForbiddenException({ code: 'auth.session_missing' });
    }
    const tenantId = TenantId.parse(rawTenantId);
    return wrap(() =>
      this.service.execute({
        userId: operator.userId,
        tenantId,
        baseRole: operator.baseRole,
        locationId: input.locationId,
        sessionToken,
      }),
    );
  }

  @Get('locations')
  @RequiresTenantContext()
  @Permissions({ location: ['read'] })
  @ApiOkResponse({ type: ListPinnableLocationsResponseDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  async listPinnableLocations(
    @CurrentOperator() operator: OperatorPrincipal,
  ): Promise<ListPinnableLocationsResponseDto> {
    const { tenantId: rawTenantId } = operator;
    if (!rawTenantId) {
      throw new ForbiddenException({ code: 'auth.no_active_tenant' });
    }
    const tenantId = TenantId.parse(rawTenantId);
    const locations = await wrap(() =>
      this.reader.findPinnableLocations({
        userId: operator.userId,
        tenantId,
        isOwner: operator.baseRole === 'owner',
      }),
    );
    return { locations: [...locations] };
  }
}
