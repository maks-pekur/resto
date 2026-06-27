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
import Stripe from 'stripe';
import { ENV_TOKEN } from '../../../../config/config.module';
import type { Env } from '../../../../config/env.schema';
import { Public } from '../../../../shared/auth/public.decorator';
import { HandleStripeEventService } from '../../application/handle-stripe-event.service';

@Controller()
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);

  constructor(
    @Inject(ENV_TOKEN) private readonly env: Env,
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
    const secret = this.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) {
      this.logger.warn('STRIPE_WEBHOOK_SECRET not configured — rejecting webhook');
      throw new BadRequestException('Webhook not configured');
    }

    let event: Stripe.Event;
    try {
      event = Stripe.webhooks.constructEvent(rawBody, sig, secret);
    } catch {
      throw new BadRequestException('Invalid Stripe signature');
    }

    await this.handler.handle(event);
    return { received: true };
  }
}
