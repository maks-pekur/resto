import { Controller, Get, HttpCode, HttpStatus, Inject, Query } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { RestoZodValidationPipe } from '../../../../shared/api/zod-validation.pipe';
import { LocationNeutral, Permissions, RequireActiveTenant } from '../../../../shared/auth';
import { CurrentOperator } from '../../../identity/interfaces/http/decorators/current-principal.decorator';
import type { OperatorPrincipal } from '../../../identity/domain/principal';
import { GetDashboardKpisService } from '../../application/get-dashboard-kpis.service';
import {
  DashboardKpisQueryDto,
  DashboardKpisResponseDto,
  type DashboardKpisResponse,
} from '../../application/dashboard-dto';

@ApiTags('analytics')
@Controller('v1/analytics')
export class AnalyticsController {
  constructor(
    @Inject(GetDashboardKpisService) private readonly getDashboardKpis: GetDashboardKpisService,
  ) {}

  @Get('dashboard')
  @HttpCode(HttpStatus.OK)
  @Permissions({ reports: ['read'] })
  @RequireActiveTenant()
  @LocationNeutral()
  @ApiOkResponse({ type: DashboardKpisResponseDto })
  async dashboard(
    @CurrentOperator() operator: OperatorPrincipal,
    @Query(new RestoZodValidationPipe(DashboardKpisQueryDto)) query: DashboardKpisQueryDto,
  ): Promise<DashboardKpisResponse> {
    return this.getDashboardKpis.execute({
      ...(query.days !== undefined ? { days: query.days } : {}),
      userId: operator.userId,
      isOwner: operator.baseRole === 'owner',
    });
  }
}
