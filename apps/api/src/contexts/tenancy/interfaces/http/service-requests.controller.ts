import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
} from '@nestjs/common';
import { ApiForbiddenResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { ProblemDetailsDto } from '../../../../shared/api/problem-details.dto';
import { Permissions, RequireActiveTenant } from '../../../../shared/auth';
import {
  SERVICE_REQUEST_REPOSITORY,
  type ServiceRequestRepository,
} from '../../domain/service-request';

const ServiceRequestSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(['waiter', 'bill']),
  zoneName: z.string(),
  tableNumber: z.string(),
  createdAt: z.string(),
});
const ServiceRequestListSchema = z.object({ items: z.array(ServiceRequestSchema) });
type ServiceRequestList = z.infer<typeof ServiceRequestListSchema>;
class ServiceRequestListDto extends createZodDto(ServiceRequestListSchema) {}

/** The floor's queue of raised hands. Location scoping comes from the request's own header. */
@ApiTags('tenancy')
@Controller('v1/tenancy/service-requests')
export class ServiceRequestsController {
  constructor(
    @Inject(SERVICE_REQUEST_REPOSITORY)
    private readonly requests: ServiceRequestRepository,
  ) {}

  @Get()
  @Permissions({ order: ['read'] })
  @RequireActiveTenant()
  @ApiOkResponse({ type: ServiceRequestListDto })
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  async listOpen(): Promise<ServiceRequestList> {
    const items = await this.requests.listOpen();
    return {
      items: items.map((item) => ({
        id: item.id,
        kind: item.kind,
        zoneName: item.zoneName,
        tableNumber: item.tableNumber,
        createdAt: item.createdAt.toISOString(),
      })),
    };
  }

  @Patch(':id/resolve')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Permissions({ order: ['update-status'] })
  @RequireActiveTenant()
  @ApiForbiddenResponse({ type: ProblemDetailsDto })
  async resolve(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.requests.resolve(id);
  }
}
