import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { trace } from '@opentelemetry/api';
import { requireTenantContext } from '@resto/db';
import { OrderId, TenantId } from '@resto/domain';
import { RestoZodValidationPipe } from '../../../../shared/api/zod-validation.pipe';
import { Permissions, RequireActiveTenant } from '../../../../shared/auth';
import { wrapWith } from '../../../../shared/api/wrap';
import { CurrentOperator } from '../../../identity/interfaces/http/decorators/current-principal.decorator';
import type { OperatorPrincipal } from '../../../identity/domain/principal';
import { AcceptOrderService } from '../../application/accept-order.service';
import { AdvanceOrderStatusService } from '../../application/advance-order-status.service';
import { ListOrdersService } from '../../application/list-orders.service';
import { GetOrderDetailService } from '../../application/get-order-detail.service';
import type { OrderFeedListResponse } from '../../application/order-feed-dto';
import {
  AcceptOrderInputDto,
  AdvanceOrderStatusInputDto,
  OrderDetailResponseDto,
  OrderFeedListResponseDto,
  OrderFeedQueryDto,
  OrderSnapshotResponseDto,
  toOrderDetailResponse,
  toOrderFeedListResponse,
  toOrderSnapshotResponse,
  type OrderDetailResponse,
  type OrderSnapshotResponse,
} from './operator-orders.dto';
import { mapOrderError } from './error-mapping';

const wrap = wrapWith(mapOrderError);

@ApiTags('ordering')
@Controller('v1/orders')
export class OperatorOrdersController {
  constructor(
    @Inject(ListOrdersService) private readonly listOrders: ListOrdersService,
    @Inject(GetOrderDetailService) private readonly getOrderDetail: GetOrderDetailService,
    @Inject(AcceptOrderService) private readonly acceptOrder: AcceptOrderService,
    @Inject(AdvanceOrderStatusService)
    private readonly advanceOrderStatus: AdvanceOrderStatusService,
  ) {}

  @Get('feed')
  @HttpCode(HttpStatus.OK)
  @Permissions({ order: ['read'] })
  @RequireActiveTenant()
  @ApiOkResponse({ type: OrderFeedListResponseDto })
  feed(
    @Query(new RestoZodValidationPipe(OrderFeedQueryDto)) query: OrderFeedQueryDto,
  ): Promise<OrderFeedListResponse> {
    if ((query.sinceCreatedAt === undefined) !== (query.sinceId === undefined)) {
      throw new BadRequestException({
        code: 'validation.failed',
        message: 'sinceCreatedAt and sinceId must be provided together.',
      });
    }
    trace.getActiveSpan()?.setAttribute('resto.traffic_kind', 'poll');
    return wrap(async () =>
      toOrderFeedListResponse(
        await this.listOrders.execute({
          ...(query.statusFilter !== undefined ? { statusPreset: query.statusFilter } : {}),
          ...(query.channel !== undefined ? { channel: query.channel } : {}),
          ...(query.datePreset !== undefined ? { datePreset: query.datePreset } : {}),
          ...(query.sinceCreatedAt !== undefined && query.sinceId !== undefined
            ? { since: { createdAt: new Date(query.sinceCreatedAt), id: query.sinceId } }
            : {}),
          ...(query.limit !== undefined ? { limit: query.limit } : {}),
          ...(query.offset !== undefined ? { offset: query.offset } : {}),
        }),
      ),
    );
  }

  @Get(':id/detail')
  @HttpCode(HttpStatus.OK)
  @Permissions({ order: ['read'] })
  @RequireActiveTenant()
  @ApiOkResponse({ type: OrderDetailResponseDto })
  detail(@Param('id', ParseUUIDPipe) id: string): Promise<OrderDetailResponse> {
    return wrap(async () =>
      toOrderDetailResponse(await this.getOrderDetail.execute({ orderId: id })),
    );
  }

  @Post(':id/accept')
  @HttpCode(HttpStatus.OK)
  @Permissions({ order: ['update-status'] })
  @RequireActiveTenant()
  @ApiBody({ type: AcceptOrderInputDto })
  @ApiOkResponse({ type: OrderSnapshotResponseDto })
  accept(
    @CurrentOperator() operator: OperatorPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new RestoZodValidationPipe(AcceptOrderInputDto)) input: AcceptOrderInputDto,
  ): Promise<OrderSnapshotResponse> {
    return wrap(async () =>
      toOrderSnapshotResponse(
        await this.acceptOrder.execute({
          orderId: OrderId.parse(id),
          tenantId: TenantId.parse(requireTenantContext().tenantId),
          prepMinutes: input.prepMinutes,
          actorUserId: operator.userId,
        }),
      ),
    );
  }

  @Post(':id/advance')
  @HttpCode(HttpStatus.OK)
  @Permissions({ order: ['update-status'] })
  @RequireActiveTenant()
  @ApiBody({ type: AdvanceOrderStatusInputDto })
  @ApiOkResponse({ type: OrderSnapshotResponseDto })
  advance(
    @CurrentOperator() operator: OperatorPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new RestoZodValidationPipe(AdvanceOrderStatusInputDto)) input: AdvanceOrderStatusInputDto,
  ): Promise<OrderSnapshotResponse> {
    return wrap(async () =>
      toOrderSnapshotResponse(
        await this.advanceOrderStatus.execute({
          orderId: OrderId.parse(id),
          tenantId: TenantId.parse(requireTenantContext().tenantId),
          targetStatus: input.targetStatus,
          actorUserId: operator.userId,
        }),
      ),
    );
  }
}
