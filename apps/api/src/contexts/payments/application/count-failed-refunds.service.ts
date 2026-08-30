import { Inject, Injectable } from '@nestjs/common';
import { requireTenantContext } from '@resto/db';
import { TenantId } from '@resto/domain';
import { TRANSACTION_READER, type TransactionReader } from '../domain/ports';

@Injectable()
export class CountFailedRefundsService {
  constructor(@Inject(TRANSACTION_READER) private readonly reader: TransactionReader) {}

  async execute(): Promise<{ refundFailed: number }> {
    const ctx = requireTenantContext();
    const refundFailed = await this.reader.countFailedRefunds(TenantId.parse(ctx.tenantId));
    return { refundFailed };
  }
}
