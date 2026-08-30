import type { components } from '@resto/api-client';
import { apiFetch } from '@/lib/api-client';
import type { DateRange } from '@/lib/date-range';

type Schemas = components['schemas'];

export type TransactionsResponse = Schemas['TransactionsResponseDto'];
export type TransactionRowApi = TransactionsResponse['rows'][number];
export type TransactionAlerts = Schemas['TransactionAlertsResponseDto'];

export type TransactionStatusFilter = 'all' | 'paid' | 'refunded' | 'refund_failed';

const STALE_TRANSACTIONS = 15_000;
const STALE_ALERTS = 30_000;

export const transactionsQuery = (status: TransactionStatusFilter, range: DateRange) => ({
  queryKey: ['transactions', 'list', status, range.from, range.to] as const,
  queryFn: () =>
    apiFetch<TransactionsResponse>(
      `/v1/payments/transactions?status=${status}&from=${range.from}&to=${range.to}`,
    ),
  staleTime: STALE_TRANSACTIONS,
});

export const transactionAlertsQuery = () => ({
  queryKey: ['transactions', 'alerts'] as const,
  queryFn: () => apiFetch<TransactionAlerts>('/v1/payments/transactions/alerts'),
  staleTime: STALE_ALERTS,
});
