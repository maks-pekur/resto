import { BadRequestException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import Stripe from 'stripe';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HandleStripeEventService } from '../../application/handle-stripe-event.service';
import { PAYMENT_PROVIDER_PORT, type PaymentProviderPort } from '../../domain/ports';
import { StripeWebhookController } from './stripe-webhook.controller';

const WEBHOOK_SECRET = 'whsec_test_secret_1234567890abcdef';

const makeRawBody = (payload: object): Buffer => Buffer.from(JSON.stringify(payload));

const makeValidSig = (rawBody: Buffer, secret: string): string =>
  Stripe.webhooks.generateTestHeaderString({
    payload: rawBody.toString(),
    secret,
  });

const makeProviderMock = (secret: string): PaymentProviderPort => ({
  ensureOnboardingAccount: vi.fn(),
  createOnboardingLink: vi.fn(),
  createOnboardingSession: vi.fn(),
  exchangeOAuthCode: vi.fn(),
  retrieveAccount: vi.fn(),
  createPaymentIntent: vi.fn(),
  cancelPaymentIntent: vi.fn(),
  createRefund: vi.fn(),
  verifyWebhookSignature: vi
    .fn()
    .mockImplementation((input: { rawBody: Buffer; signature: string }) => {
      return Stripe.webhooks.constructEvent(input.rawBody, input.signature, secret);
    }),
});

describe('StripeWebhookController', () => {
  let controller: StripeWebhookController;
  let handler: { handle: ReturnType<typeof vi.fn> };
  let providerMock: PaymentProviderPort;

  beforeEach(async () => {
    handler = { handle: vi.fn().mockResolvedValue(undefined) };
    providerMock = makeProviderMock(WEBHOOK_SECRET);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [StripeWebhookController],
      providers: [
        { provide: PAYMENT_PROVIDER_PORT, useValue: providerMock },
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

  it('returns 400 when verifyWebhookSignature throws (missing secret)', async () => {
    const brokenProvider = makeProviderMock('wrong_secret');
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StripeWebhookController],
      providers: [
        { provide: PAYMENT_PROVIDER_PORT, useValue: brokenProvider },
        { provide: HandleStripeEventService, useValue: handler },
      ],
    }).compile();

    const ctrl = module.get(StripeWebhookController);
    const rawBody = makeRawBody({ type: 'account.updated' });
    const sig = makeValidSig(rawBody, WEBHOOK_SECRET);
    const req = { rawBody } as never;
    await expect(ctrl.handleWebhook(req, sig)).rejects.toThrow(BadRequestException);
    expect(handler.handle).not.toHaveBeenCalled();
  });

  it('returns 400 when rawBody is missing', async () => {
    const req = {} as never;
    await expect(controller.handleWebhook(req, 'some-sig')).rejects.toThrow(BadRequestException);
    expect(handler.handle).not.toHaveBeenCalled();
  });
});
