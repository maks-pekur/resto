import {
  BadRequestException,
  Controller,
  Headers,
  Inject,
  Logger,
  Post,
  Req,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { Public } from '../../../../shared/auth/public.decorator';
import { HandleStripeEventService } from '../../application/handle-stripe-event.service';
import { PAYMENT_PROVIDER_PORT, type PaymentProviderPort } from '../../domain/ports';

@Controller()
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);

  constructor(
    @Inject(PAYMENT_PROVIDER_PORT) private readonly provider: PaymentProviderPort,
    @Inject(HandleStripeEventService) private readonly handler: HandleStripeEventService,
  ) {}

  @Public()
  @Post('webhook/stripe')
  async handleWebhook(
    @Req() req: FastifyRequest,
    @Headers('stripe-signature') sig: string | undefined,
  ): Promise<{ received: boolean }> {
    const rawBody = (req as FastifyRequest & { rawBody?: Buffer }).rawBody;
    if (!rawBody) {
      throw new BadRequestException('Missing raw body');
    }
    if (!sig) {
      throw new BadRequestException('Missing stripe-signature header');
    }

    let event;
    try {
      event = this.provider.verifyWebhookSignature({ rawBody, signature: sig });
    } catch {
      throw new BadRequestException('Invalid Stripe signature');
    }

    await this.handler.handle(event);
    return { received: true };
  }
}
