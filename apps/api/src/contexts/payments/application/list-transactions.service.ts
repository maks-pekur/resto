import { Inject, Injectable } from '@nestjs/common';
import { requireTenantContext } from '@resto/db';
import { TenantId } from '@resto/domain';
import {
  TRANSACTION_READER,
  type TransactionReader,
  type TransactionRow,
  type TransactionStatusFilter,
} from '../domain/ports';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export interface ListTransactionsInput {
  readonly status?: TransactionStatusFilter;
  readonly from?: string;
  readonly to?: string;
  readonly limit?: number;
  readonly offset?: number;
}

export interface ListTransactionsResult {
  readonly rows: readonly TransactionRow[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

@Injectable()
export class ListTransactionsService {
  constructor(@Inject(TRANSACTION_READER) private readonly reader: TransactionReader) {}

  async execute(input: ListTransactionsInput): Promise<ListTransactionsResult> {
    const ctx = requireTenantContext();
    const tenantId = TenantId.parse(ctx.tenantId);
    const limit = Math.min(Math.max(input.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
    const offset = Math.max(input.offset ?? 0, 0);

    // Dates arrive as calendar days and cover them whole; the boundary is the next midnight UTC.
    const createdFrom = input.from === undefined ? undefined : new Date(`${input.from}T00:00:00Z`);
    const createdTo =
      input.to === undefined
        ? undefined
        : new Date(new Date(`${input.to}T00:00:00Z`).getTime() + 86_400_000);

    const { rows, total } = await this.reader.list({
      tenantId,
      status: input.status ?? 'all',
      ...(createdFrom !== undefined ? { createdFrom } : {}),
      ...(createdTo !== undefined ? { createdTo } : {}),
      limit,
      offset,
    });

    return { rows, total, limit, offset };
  }
}
