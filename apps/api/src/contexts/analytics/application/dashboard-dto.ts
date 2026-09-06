import { createZodDto } from 'nestjs-zod';
import { CurrencyValue, MoneyAmountValue } from '@resto/domain';
import { z } from 'zod';

export const MAX_DASHBOARD_RANGE_DAYS = 366;

const CalendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a YYYY-MM-DD date.');

export const DashboardKpisQueryInputSchema = z
  .object({
    from: CalendarDate.optional(),
    to: CalendarDate.optional(),
  })
  .superRefine((value, ctx) => {
    if ((value.from === undefined) !== (value.to === undefined)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Both "from" and "to" are required when either is given.',
        path: [value.from === undefined ? 'from' : 'to'],
      });
      return;
    }
    if (value.from === undefined || value.to === undefined) return;
    if (value.to < value.from) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '"to" cannot be earlier than "from".',
        path: ['to'],
      });
    }
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
    from: CalendarDate,
    to: CalendarDate,
  }),
  currency: CurrencyValue,
  revenue: MoneyMetricSchema,
  completedOrders: CountMetricSchema,
  newGuests: CountMetricSchema,
  refunds: MoneyMetricSchema,
});
export type DashboardKpisResponse = z.infer<typeof DashboardKpisResponseSchema>;
export class DashboardKpisResponseDto extends createZodDto(DashboardKpisResponseSchema) {}
