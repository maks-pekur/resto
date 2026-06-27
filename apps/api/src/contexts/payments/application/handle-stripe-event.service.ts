import { Injectable, Logger } from '@nestjs/common';
import type Stripe from 'stripe';

@Injectable()
export class HandleStripeEventService {
  private readonly logger = new Logger(HandleStripeEventService.name);

  handle(_event: Stripe.Event): Promise<void> {
    this.logger.log({ type: _event.type }, 'Stripe event received — handler pending (Task 2).');
    return Promise.resolve();
  }
}
