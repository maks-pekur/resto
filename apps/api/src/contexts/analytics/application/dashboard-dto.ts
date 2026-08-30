import { createZodDto } from 'nestjs-zod';
import { CurrencyValue, MoneyAmountValue } from '@resto/domain';
import { z } from 'zod';

export const DASHBOARD_RANGE_DAYS = [7, 28, 90] as const;
export const DEFAULT_DASHBOARD_RANGE_DAYS = 28;

export const DashboardKpisQueryInputSchema = z.object({
  days: z.coerce
    .number()
    .int()
    .refine((v): v is (typeof DASHBOARD_RANGE_DAYS)[number] =>
      DASHBOARD_RANGE_DAYS.includes(v as (typeof DASHBOARD_RANGE_DAYS)[number]),
    )
    .optional(),
});
export type DashboardKpisQueryInput = z.infer<typeof DashboardKpisQueryInputSchema>;
export class DashboardKpisQueryDto extends createZodDto(DashboardKpisQueryInputSchema) {}

const MoneyMetricSchema = z.object({
  value: MoneyAmountValue,
  previous: MoneyAmountValue,
});

const CountMetricSchema = z.object({
  value: z.number().int().nonnegative(),
  previous: z.number().int().nonnegative(),
});

export const DashboardKpisResponseSchema = z.object({
  range: z.object({
    from: z.string().datetime({ offset: true }),
    to: z.string().datetime({ offset: true }),
    days: z.number().int().positive(),
  }),
  currency: CurrencyValue,
  revenue: MoneyMetricSchema,
  completedOrders: CountMetricSchema,
  newGuests: CountMetricSchema,
  refunds: MoneyMetricSchema,
});
export type DashboardKpisResponse = z.infer<typeof DashboardKpisResponseSchema>;
export class DashboardKpisResponseDto extends createZodDto(DashboardKpisResponseSchema) {}
