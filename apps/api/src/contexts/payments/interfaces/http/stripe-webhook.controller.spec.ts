import { BadRequestException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import Stripe from 'stripe';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ENV_TOKEN } from '../../../../config/config.module';
import type { Env } from '../../../../config/env.schema';
import { HandleStripeEventService } from '../../application/handle-stripe-event.service';
import { StripeWebhookController } from './stripe-webhook.controller';

const WEBHOOK_SECRET = 'whsec_test_secret_1234567890abcdef';

const makeEnv = (overrides: Partial<Env> = {}): Env =>
  ({
    NODE_ENV: 'test',
    STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
    ...overrides,
  }) as unknown as Env;

const makeRawBody = (payload: object): Buffer => Buffer.from(JSON.stringify(payload));

const makeValidSig = (rawBody: Buffer, secret: string): string =>
  Stripe.webhooks.generateTestHeaderString({
    payload: rawBody.toString(),
    secret,
  });

describe('StripeWebhookController', () => {
  let controller: StripeWebhookController;
  let handler: { handle: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    handler = { handle: vi.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [StripeWebhookController],
      providers: [
        { provide: ENV_TOKEN, useValue: makeEnv() },
        { provide: HandleStripeEventService, useValue: handler },
      ],
    }).compile();

    controller = module.get(StripeWebhookController);
  });

  it('returns 400 on missing stripe-signature', async () => {
    const rawBody = makeRawBody({ type: 'account.updated' });
    const req = { rawBody } as never;
    await expect(controller.handleWebhook(req, undefined)).rejects.toThrow(BadRequestException);
    expect(handler.handle).not.toHaveBeenCalled();
  });

  it('returns 400 on invalid stripe-signature', async () => {
    const rawBody = makeRawBody({ type: 'account.updated' });
    const req = { rawBody } as never;
    await expect(controller.handleWebhook(req, 't=123,v1=badhash')).rejects.toThrow(
      BadRequestException,
    );
    expect(handler.handle).not.toHaveBeenCalled();
  });

  it('returns { received: true } on valid stripe-signature and calls handler', async () => {
    const payload = { id: 'evt_test_123', type: 'account.updated', data: { object: {} } };
    const rawBody = makeRawBody(payload);
    const sig = makeValidSig(rawBody, WEBHOOK_SECRET);
    const req = { rawBody } as never;

    const result = await controller.handleWebhook(req, sig);

    expect(result).toEqual({ received: true });
    expect(handler.handle).toHaveBeenCalledOnce();
  });

  it('returns 400 when STRIPE_WEBHOOK_SECRET is not configured', async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StripeWebhookController],
      providers: [
        { provide: ENV_TOKEN, useValue: makeEnv({ STRIPE_WEBHOOK_SECRET: undefined }) },
        { provide: HandleStripeEventService, useValue: handler },
      ],
    }).compile();

    const ctrl = module.get(StripeWebhookController);
    const rawBody = makeRawBody({ type: 'account.updated' });
    const req = { rawBody } as never;
    await expect(ctrl.handleWebhook(req, 'some-sig')).rejects.toThrow(BadRequestException);
    expect(handler.handle).not.toHaveBeenCalled();
  });

  it('returns 400 when rawBody is missing', async () => {
    const req = {} as never;
    await expect(controller.handleWebhook(req, 'some-sig')).rejects.toThrow(BadRequestException);
    expect(handler.handle).not.toHaveBeenCalled();
  });
});
