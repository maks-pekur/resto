import { Inject, Injectable } from '@nestjs/common';
import { requireTenantContext } from '@resto/db';
import { ORDER_REPOSITORY, type GuestOrderRow, type OrderRepository } from '../domain/ports';

const MAX_GUEST_ORDER_HISTORY = 50;

@Injectable()
export class ListMyOrdersService {
  constructor(@Inject(ORDER_REPOSITORY) private readonly repo: OrderRepository) {}

  // 10.7 D-15: the caller supplies the guest, the tenant comes from the request's own context.
  // Neither is taken from the client.
  async execute(customerUserId: string): Promise<GuestOrderRow[]> {
    requireTenantContext();
    return this.repo.listForCustomer(customerUserId, MAX_GUEST_ORDER_HISTORY);
  }
}
