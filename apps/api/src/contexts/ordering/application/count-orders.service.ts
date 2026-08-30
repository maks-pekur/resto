import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { getLocationId, requireTenantContext } from '@resto/db';
import { TenantId } from '@resto/domain';
import { LOCATION_REPOSITORY, type LocationRepository } from '../../tenancy/domain/ports';
import {
  ORDER_FEED_REPOSITORY,
  type OrderFeedCounts,
  type OrderFeedRepository,
} from '../domain/ports';
import { resolveWindow } from './list-orders.service';
import type { OrderDatePreset } from './order-feed-dto';

export interface CountOrdersInput {
  readonly datePreset?: OrderDatePreset;
  readonly from?: string;
  readonly to?: string;
  readonly fulfillmentMode?: 'dine_in' | 'pickup' | 'delivery';
}

@Injectable()
export class CountOrdersService {
  constructor(
    @Inject(ORDER_FEED_REPOSITORY) private readonly feedRepo: OrderFeedRepository,
    @Inject(LOCATION_REPOSITORY) private readonly locations: LocationRepository,
  ) {}

  async execute(input: CountOrdersInput): Promise<OrderFeedCounts> {
    const ctx = requireTenantContext();
    const tenantId = TenantId.parse(ctx.tenantId);
    const requestedLocationId = getLocationId();

    if (requestedLocationId === undefined) {
      throw new ForbiddenException({
        code: 'location.context_required',
        message: 'Location context is required for the order feed.',
      });
    }

    const active = (await this.locations.listForTenant(tenantId)).filter(
      (l) => l.status === 'active',
    );
    const match = active.find((l) => l.id === requestedLocationId);
    if (!match) throw new NotFoundException();

    const { from, to } = resolveWindow(input, match.timezone);

    return this.feedRepo.counts({
      tenantId,
      locationIds: [match.id],
      ...(input.fulfillmentMode !== undefined ? { fulfillmentMode: input.fulfillmentMode } : {}),
      createdFrom: from,
      createdTo: to,
    });
  }
}
