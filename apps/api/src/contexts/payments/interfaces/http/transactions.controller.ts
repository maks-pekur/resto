import { Controller, Get, HttpCode, HttpStatus, Inject, Query } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { CurrencyValue, MoneyAmountValue } from '@resto/domain';
import { z } from 'zod';
import { RestoZodValidationPipe } from '../../../../shared/api/zod-validation.pipe';
import { LocationNeutral, Permissions, RequireActiveTenant } from '../../../../shared/auth';
import { ListTransactionsService } from '../../application/list-transactions.service';
import { CountFailedRefundsService } from '../../application/count-failed-refunds.service';

const CalendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a YYYY-MM-DD date.');

export const TransactionsQueryInputSchema = z.object({
  status: z.enum(['all', 'paid', 'refunded', 'refund_failed']).optional(),
  from: CalendarDate.optional(),
  to: CalendarDate.optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
});
export class TransactionsQueryDto extends createZodDto(TransactionsQueryInputSchema) {}

export const TransactionRowResponseSchema = z.object({
  paymentId: z.string().uuid(),
  orderId: z.string().uuid(),
  orderShortNumber: z.number().int(),
  locationId: z.string().uuid(),
  status: z.string(),
  amount: MoneyAmountValue,
  refundedAmount: MoneyAmountValue,
  currency: CurrencyValue,
  hasFailedRefund: z.boolean(),
  createdAt: z.string(),
});

export const TransactionsResponseSchema = z.object({
  rows: z.array(TransactionRowResponseSchema),
  total: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
});
export type TransactionsResponse = z.infer<typeof TransactionsResponseSchema>;
export class TransactionsResponseDto extends createZodDto(TransactionsResponseSchema) {}

export const TransactionAlertsResponseSchema = z.object({
  refundFailed: z.number().int().nonnegative(),
});
export type TransactionAlertsResponse = z.infer<typeof TransactionAlertsResponseSchema>;
export class TransactionAlertsResponseDto extends createZodDto(TransactionAlertsResponseSchema) {}

@ApiTags('payments')
@Controller('v1/payments/transactions')
@LocationNeutral()
export class TransactionsController {
  constructor(
    @Inject(ListTransactionsService) private readonly listTransactions: ListTransactionsService,
    @Inject(CountFailedRefundsService)
    private readonly countFailedRefunds: CountFailedRefundsService,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @Permissions({ billing: ['read'] })
  @RequireActiveTenant()
  @ApiOkResponse({ type: TransactionsResponseDto })
  async list(
    @Query(new RestoZodValidationPipe(TransactionsQueryDto)) query: TransactionsQueryDto,
  ): Promise<TransactionsResponse> {
    const result = await this.listTransactions.execute({
      ...(query.status !== undefined ? { status: query.status } : {}),
      ...(query.from !== undefined ? { from: query.from } : {}),
      ...(query.to !== undefined ? { to: query.to } : {}),
      ...(query.limit !== undefined ? { limit: query.limit } : {}),
      ...(query.offset !== undefined ? { offset: query.offset } : {}),
    });
    return {
      rows: result.rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
      total: result.total,
      limit: result.limit,
      offset: result.offset,
    };
  }

  @Get('alerts')
  @HttpCode(HttpStatus.OK)
  @Permissions({ billing: ['read'] })
  @RequireActiveTenant()
  @ApiOkResponse({ type: TransactionAlertsResponseDto })
  alerts(): Promise<TransactionAlertsResponse> {
    return this.countFailedRefunds.execute();
  }
}
