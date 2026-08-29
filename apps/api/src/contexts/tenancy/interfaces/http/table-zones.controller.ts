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
import { requireTenantContext } from '@resto/db';
import { TenantId } from '@resto/domain';
import { ProblemDetailsDto } from '../../../../shared/api/problem-details.dto';
import { RestoZodValidationPipe } from '../../../../shared/api/zod-validation.pipe';
import { wrapWith } from '../../../../shared/api/wrap';
import { Permissions, RequireActiveTenant, RequiresTenantContext } from '../../../../shared/auth';
import { CreateTableZoneService } from '../../application/create-table-zone.service';
import { ListTableZonesService } from '../../application/list-table-zones.service';
import { AddTablesService } from '../../application/add-tables.service';
import { RenameTableZoneService } from '../../application/rename-table-zone.service';
import { RenameTableService } from '../../application/rename-table.service';
import { ArchiveTableZoneService } from '../../application/archive-table-zone.service';
import { ArchiveTableService } from '../../application/archive-table.service';
import { GuestMenuUrlService } from '../../application/guest-menu-url.service';
import {
  CreateTableZoneInputDto,
  AddTablesInputDto,
  RenameTableZoneInputDto,
  UpdateTableInputDto,
  TableZoneResponseDto,
  TableResponseDto,
  type TableResponse,
  type TableZoneResponse,
} from '../../application/table-dto';
import {
  TENANT_REPOSITORY,
  type TableZoneWithTables,
  type TenantRepository,
} from '../../domain/ports';
import { TenantNotFoundError } from '../../domain/errors';
import type { TenantSnapshot } from '../../domain/tenant.aggregate';
import type { TableZoneSnapshot } from '../../domain/table-zone.aggregate';
import type { RestaurantTableSnapshot } from '../../domain/restaurant-table.aggregate';
import { mapDomainError } from './error-mapping';

const wrap = wrapWith(mapDomainError);

const TableZoneSummaryResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  status: z.enum(['active', 'archived']),
});
class TableZoneSummaryResponseDto extends createZodDto(TableZoneSummaryResponseSchema) {}

const ArchiveTableZoneResponseSchema = z.object({
  zoneId: z.string().uuid(),
  archivedTableCount: z.number().int().nonnegative(),
});
class ArchiveTableZoneResponseDto extends createZodDto(ArchiveTableZoneResponseSchema) {}

const toZoneSummary = (zone: TableZoneSnapshot) => ({
  id: zone.id,
  name: zone.name,
  status: zone.status,
});

const buildTableResponse = async (
  guestMenuUrl: GuestMenuUrlService,
  tenant: TenantSnapshot,
  table: RestaurantTableSnapshot,
): Promise<TableResponse> => ({
  id: table.id,
  number: table.number,
  ordinal: table.ordinal,
  status: table.status,
  qrUrl: await guestMenuUrl.execute({ tenant, tableId: table.id }),
});

const buildZoneResponse = async (
  guestMenuUrl: GuestMenuUrlService,
  tenant: TenantSnapshot,
  zone: TableZoneWithTables,
): Promise<TableZoneResponse> => ({
  id: zone.id,
  name: zone.name,
  status: zone.status,
  tables: await Promise.all(
    zone.tables.map((table) => buildTableResponse(guestMenuUrl, tenant, table)),
  ),
});

@ApiTags('tenancy')
@Controller('v1/tenancy/table-zones')
@RequiresTenantContext()
export class TableZonesController {
  constructor(
    @Inject(CreateTableZoneService) private readonly createZoneService: CreateTableZoneService,
    @Inject(ListTableZonesService) private readonly listZonesService: ListTableZonesService,
    @Inject(AddTablesService) private readonly addTablesService: AddTablesService,
    @Inject(RenameTableZoneService) private readonly renameZoneService: RenameTableZoneService,
    @Inject(RenameTableService) private readonly renameTableService: RenameTableService,
    @Inject(ArchiveTableZoneService) private readonly archiveZoneService: ArchiveTableZoneService,
    @Inject(ArchiveTableService) private readonly archiveTableService: ArchiveTableService,
    @Inject(TENANT_REPOSITORY) private readonly tenants: TenantRepository,
    @Inject(GuestMenuUrlService) private readonly guestMenuUrl: GuestMenuUrlService,
  ) {}

  @Get()
  @Permissions({ table: ['read'] })
  @RequireActiveTenant()
  @ApiOkResponse({ type: TableZoneResponseDto, isArray: true })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  list(): Promise<TableZoneResponseDto[]> {
    return wrap(async () => Array.from(await this.listZonesService.execute()));
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @Permissions({ table: ['update'] })
  @RequireActiveTenant()
  @ApiBody({ type: CreateTableZoneInputDto })
  @ApiOkResponse({ type: TableZoneResponseDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  create(
    @Body(new RestoZodValidationPipe(CreateTableZoneInputDto)) input: CreateTableZoneInputDto,
  ): Promise<TableZoneResponseDto> {
    return wrap(async () => {
      const zone = await this.createZoneService.execute(input);
      const tenant = await this.currentTenant();
      return buildZoneResponse(this.guestMenuUrl, tenant, zone);
    });
  }

  @Patch(':zoneId')
  @HttpCode(HttpStatus.OK)
  @Permissions({ table: ['update'] })
  @RequireActiveTenant()
  @ApiBody({ type: RenameTableZoneInputDto })
  @ApiOkResponse({ type: TableZoneSummaryResponseDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  renameZone(
    @Param('zoneId', ParseUUIDPipe) zoneId: string,
    @Body(new RestoZodValidationPipe(RenameTableZoneInputDto)) input: RenameTableZoneInputDto,
  ): Promise<TableZoneSummaryResponseDto> {
    return wrap(async () =>
      toZoneSummary(await this.renameZoneService.execute({ zoneId, name: input.name })),
    );
  }

  @Patch(':zoneId/archive')
  @HttpCode(HttpStatus.OK)
  @Permissions({ table: ['update'] })
  @RequireActiveTenant()
  @ApiOkResponse({ type: ArchiveTableZoneResponseDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  archiveZone(
    @Param('zoneId', ParseUUIDPipe) zoneId: string,
  ): Promise<ArchiveTableZoneResponseDto> {
    return wrap(() => this.archiveZoneService.execute({ zoneId }));
  }

  @Post(':zoneId/tables')
  @HttpCode(HttpStatus.OK)
  @Permissions({ table: ['update'] })
  @RequireActiveTenant()
  @ApiBody({ type: AddTablesInputDto })
  @ApiOkResponse({ type: TableResponseDto, isArray: true })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  addTables(
    @Param('zoneId', ParseUUIDPipe) zoneId: string,
    @Body(new RestoZodValidationPipe(AddTablesInputDto)) input: AddTablesInputDto,
  ): Promise<TableResponseDto[]> {
    return wrap(async () => {
      const created = await this.addTablesService.execute({ zoneId, count: input.count });
      const tenant = await this.currentTenant();
      return Promise.all(
        created.map((table) => buildTableResponse(this.guestMenuUrl, tenant, table)),
      );
    });
  }

  @Patch(':zoneId/tables/:tableId')
  @HttpCode(HttpStatus.OK)
  @Permissions({ table: ['update'] })
  @RequireActiveTenant()
  @ApiBody({ type: UpdateTableInputDto })
  @ApiOkResponse({ type: TableResponseDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  renameTable(
    @Param('zoneId', ParseUUIDPipe) _zoneId: string,
    @Param('tableId', ParseUUIDPipe) tableId: string,
    @Body(new RestoZodValidationPipe(UpdateTableInputDto)) input: UpdateTableInputDto,
  ): Promise<TableResponseDto> {
    return wrap(async () => {
      const updated = await this.renameTableService.execute({ tableId, number: input.number });
      const tenant = await this.currentTenant();
      return buildTableResponse(this.guestMenuUrl, tenant, updated);
    });
  }

  @Patch(':zoneId/tables/:tableId/archive')
  @HttpCode(HttpStatus.OK)
  @Permissions({ table: ['update'] })
  @RequireActiveTenant()
  @ApiOkResponse({ type: TableResponseDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  @ApiNotFoundResponse({ type: ProblemDetailsDto })
  archiveTable(
    @Param('zoneId', ParseUUIDPipe) _zoneId: string,
    @Param('tableId', ParseUUIDPipe) tableId: string,
  ): Promise<TableResponseDto> {
    return wrap(async () => {
      const archived = await this.archiveTableService.execute({ tableId });
      const tenant = await this.currentTenant();
      return buildTableResponse(this.guestMenuUrl, tenant, archived);
    });
  }

  private async currentTenant(): Promise<TenantSnapshot> {
    const ctx = requireTenantContext();
    const tenantId = TenantId.parse(ctx.tenantId);
    const tenant = await this.tenants.findById(tenantId);
    if (!tenant) throw new TenantNotFoundError(tenantId);
    return tenant;
  }
}
