import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBody,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { ProblemDetailsDto } from '../../../../shared/api/problem-details.dto';
import { RestoZodValidationPipe } from '../../../../shared/api/zod-validation.pipe';
import { wrapWith } from '../../../../shared/api/wrap';
import { LocationNeutral, Permissions, RequireActiveTenant } from '../../../../shared/auth';
import { ProvisionLocationService } from '../../application/provision-location.service';
import { ListLocationsService } from '../../application/list-locations.service';
import { ArchiveLocationService } from '../../application/archive-location.service';
import {
  LocationAddress,
  LocationContactsSchema,
  LocationName,
  LocationTimezone,
  type LocationSnapshot,
} from '../../domain/location.aggregate';
import { mapDomainError } from './error-mapping';

const wrap = wrapWith(mapDomainError);

const CreateLocationInputSchema = z.object({
  name: LocationName,
  address: LocationAddress.nullable().default(null),
  timezone: LocationTimezone.nullable().default(null),
  contacts: LocationContactsSchema.nullable().default(null),
});
class CreateLocationInputDto extends createZodDto(CreateLocationInputSchema) {}

const LocationResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  address: z.string().nullable(),
  timezone: z.string().nullable(),
  contacts: LocationContactsSchema.nullable(),
  status: z.enum(['active', 'archived']),
  createdAt: z.string(),
  updatedAt: z.string(),
  archivedAt: z.string().nullable(),
});
class LocationResponseDto extends createZodDto(LocationResponseSchema) {}

const ArchiveLocationResponseSchema = z.object({
  scopedMemberCount: z.number().int().nonnegative(),
});
class ArchiveLocationResponseDto extends createZodDto(ArchiveLocationResponseSchema) {}

const toResponse = (s: LocationSnapshot) => ({
  id: s.id,
  name: s.name,
  address: s.address,
  timezone: s.timezone,
  contacts: s.contacts,
  status: s.status,
  createdAt: s.createdAt.toISOString(),
  updatedAt: s.updatedAt.toISOString(),
  archivedAt: s.archivedAt?.toISOString() ?? null,
});

@ApiTags('tenancy')
@LocationNeutral()
@Controller('v1/tenancy/locations')
export class LocationsController {
  constructor(
    @Inject(ProvisionLocationService)
    private readonly provisionLocation: ProvisionLocationService,
    @Inject(ListLocationsService) private readonly listLocations: ListLocationsService,
    @Inject(ArchiveLocationService) private readonly archiveLocation: ArchiveLocationService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @Permissions({ location: ['create'] })
  @RequireActiveTenant()
  @ApiBody({ type: CreateLocationInputDto })
  @ApiOkResponse({ type: LocationResponseDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  create(
    @Body(new RestoZodValidationPipe(CreateLocationInputDto)) input: CreateLocationInputDto,
  ): Promise<LocationResponseDto> {
    return wrap(async () => toResponse(await this.provisionLocation.execute(input)));
  }

  @Get()
  @Permissions({ location: ['read'] })
  @RequireActiveTenant()
  @ApiOkResponse({ type: LocationResponseDto, isArray: true })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  list(): Promise<LocationResponseDto[]> {
    return wrap(async () => (await this.listLocations.execute()).map(toResponse));
  }

  @Patch(':id/archive')
  @HttpCode(HttpStatus.OK)
  @Permissions({ location: ['update'] })
  @RequireActiveTenant()
  @ApiOkResponse({ type: ArchiveLocationResponseDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  archive(@Param('id', ParseUUIDPipe) id: string): Promise<ArchiveLocationResponseDto> {
    return wrap(() => this.archiveLocation.execute(id));
  }
}
