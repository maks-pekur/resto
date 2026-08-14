import { describe, expect, it, vi } from 'vitest';
import { Logger } from '@nestjs/common';
import type { BrandSnapshot } from '../../tenancy/domain/brand.aggregate';
import type { BrandQueriesService } from '../../tenancy/application/brand-queries.service';
import type { EmailAdapterPort, SendGuestNotificationInput } from '../domain/ports';
import type { Env } from '../../../config/env.schema';
import type {
  NotificationOrderRepository,
  NotificationOrderRow,
} from '../infrastructure/notification-order-drizzle.repository';
import { SendGuestNotificationService } from './send-guest-notification.service';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const ORDER_ID = '22222222-2222-2222-2222-222222222222';
const BRAND_ID = '33333333-3333-3333-3333-333333333333';
const WEBSITE_PUBLIC_URL = 'https://order.resto.app';

const baseOrder = {
  id: ORDER_ID,
  tenantId: TENANT_ID,
  brandId: BRAND_ID,
  orderNumber: 'ORD-001',
  customerEmail: 'guest@example.com',
  total: '25.00',
  currency: 'EUR',
  etaAt: null,
  shortNumber: null,
  locationTimezone: null,
};

const makeEnv = (websitePublicUrl: string | undefined): Env =>
  ({ WEBSITE_PUBLIC_URL: websitePublicUrl }) as unknown as Env;

const baseBrand: BrandSnapshot = {
  id: BRAND_ID as BrandSnapshot['id'],
  tenantId: TENANT_ID as BrandSnapshot['tenantId'],
  slug: 'acme',
  displayName: 'Acme',
  status: 'active',
  theme: { logoUrl: 'https://cdn.acme.com/logo.png', primaryColor: '#16a34a', font: null },
  paymentProvider: 'stripe',
  accountType: null,
  defaultCurrency: null,
  stripeAccountId: null,
  stripeChargesEnabled: false,
  stripePayoutsEnabled: false,
  stripeOnboardingStatus: 'not_started',
  stripeRequirementsDue: null,
};

const makeOrderRepo = (
  order: NotificationOrderRow | null,
  items: { nameSnapshot: string; quantity: number }[] = [],
): NotificationOrderRepository => ({
  findOrder: vi.fn(() => Promise.resolve(order)),
  findOrderItems: vi.fn(() => Promise.resolve(items)),
});

const makeBrandQueries = (brand: BrandSnapshot | null): BrandQueriesService =>
  ({
    listForTenant: vi.fn(() => Promise.resolve(brand ? [brand] : [])),
  }) as unknown as BrandQueriesService;

const makeEmailAdapter = (): EmailAdapterPort & { calls: SendGuestNotificationInput[] } => {
  const calls: SendGuestNotificationInput[] = [];
  return {
    adapterName: 'captured',
    sendInvitation: vi.fn(),
    sendResetPassword: vi.fn(),
    sendVerification: vi.fn(),
    sendGuestNotification: vi.fn((input: SendGuestNotificationInput): Promise<void> => {
      calls.push(input);
      return Promise.resolve();
    }),
    verifyTransport: vi.fn(),
    calls,
  } as unknown as EmailAdapterPort & { calls: SendGuestNotificationInput[] };
};

describe('SendGuestNotificationService', () => {
  describe('GNOTIF-01: order_confirmation', () => {
    it('sends one email to customerEmail with kind order_confirmation', async () => {
      const email = makeEmailAdapter();
      const svc = new SendGuestNotificationService(
        email,
        makeBrandQueries(baseBrand),
        makeOrderRepo(baseOrder, [{ nameSnapshot: 'Burger', quantity: 1 }]),
        makeEnv(WEBSITE_PUBLIC_URL),
      );

      await svc.execute({
        orderId: ORDER_ID,
        tenantId: TENANT_ID,
        transition: 'order_confirmation',
      });

      expect(email.sendGuestNotification).toHaveBeenCalledOnce();
      const call = email.calls[0];
      expect(call?.to).toBe('guest@example.com');
      expect(call?.kind).toBe('order_confirmation');
      expect(call?.brandName).toBe('Acme');
      expect(call?.vars.orderNumber).toBe('ORD-001');
    });

    it('idempotencyKey is gnotif:<orderId>:order_confirmation', async () => {
      const email = makeEmailAdapter();
      const svc = new SendGuestNotificationService(
        email,
        makeBrandQueries(baseBrand),
        makeOrderRepo(baseOrder),
        makeEnv(WEBSITE_PUBLIC_URL),
      );

      await svc.execute({
        orderId: ORDER_ID,
        tenantId: TENANT_ID,
        transition: 'order_confirmation',
      });

      expect(email.calls[0]?.idempotencyKey).toBe(`gnotif:${ORDER_ID}:order_confirmation`);
    });

    it('applies brand theme to the notification input (GNOTIF-04)', async () => {
      const email = makeEmailAdapter();
      const svc = new SendGuestNotificationService(
        email,
        makeBrandQueries(baseBrand),
        makeOrderRepo(baseOrder),
        makeEnv(WEBSITE_PUBLIC_URL),
      );

      await svc.execute({
        orderId: ORDER_ID,
        tenantId: TENANT_ID,
        transition: 'order_confirmation',
      });

      expect(email.calls[0]?.brandTheme).toMatchObject({ accentColor: '#16a34a' });
    });
  });

  describe('GNOTIF-03: order_refunded', () => {
    it('sends refund email with refundAmount in vars', async () => {
      const email = makeEmailAdapter();
      const svc = new SendGuestNotificationService(
        email,
        makeBrandQueries(baseBrand),
        makeOrderRepo(baseOrder),
        makeEnv(WEBSITE_PUBLIC_URL),
      );

      await svc.execute({
        orderId: ORDER_ID,
        tenantId: TENANT_ID,
        transition: 'order_refunded',
        refundAmountMinor: 1250,
      });

      expect(email.calls[0]?.kind).toBe('order_refunded');
      expect(email.calls[0]?.vars.refundAmount).toBe('12.50');
    });
  });

  describe('missing customerEmail — graceful skip', () => {
    it('does not send and does not throw when customerEmail is null', async () => {
      const email = makeEmailAdapter();
      const svc = new SendGuestNotificationService(
        email,
        makeBrandQueries(baseBrand),
        makeOrderRepo({ ...baseOrder, customerEmail: null }),
        makeEnv(WEBSITE_PUBLIC_URL),
      );

      await expect(
        svc.execute({ orderId: ORDER_ID, tenantId: TENANT_ID, transition: 'order_confirmation' }),
      ).resolves.toBeUndefined();

      expect(email.sendGuestNotification).not.toHaveBeenCalled();
    });

    it('does not throw when order is not found', async () => {
      const email = makeEmailAdapter();
      const svc = new SendGuestNotificationService(
        email,
        makeBrandQueries(baseBrand),
        makeOrderRepo(null),
        makeEnv(WEBSITE_PUBLIC_URL),
      );

      await expect(
        svc.execute({ orderId: ORDER_ID, tenantId: TENANT_ID, transition: 'order_confirmation' }),
      ).resolves.toBeUndefined();

      expect(email.sendGuestNotification).not.toHaveBeenCalled();
    });
  });

  describe('GNOTIF-02: order_accepted (Phase-10 wiring)', () => {
    it('sends order_accepted email', async () => {
      const email = makeEmailAdapter();
      const svc = new SendGuestNotificationService(
        email,
        makeBrandQueries(baseBrand),
        makeOrderRepo(baseOrder),
        makeEnv(WEBSITE_PUBLIC_URL),
      );

      await svc.execute({ orderId: ORDER_ID, tenantId: TENANT_ID, transition: 'order_accepted' });

      expect(email.calls[0]?.kind).toBe('order_accepted');
    });
  });

  describe('D-15: ETA plumbing', () => {
    it('reaches vars as a localized clock-time string when etaAt is set', async () => {
      const email = makeEmailAdapter();
      const svc = new SendGuestNotificationService(
        email,
        makeBrandQueries(baseBrand),
        makeOrderRepo({
          ...baseOrder,
          etaAt: new Date('2026-06-28T19:45:00Z'),
          locationTimezone: 'UTC',
        }),
        makeEnv(WEBSITE_PUBLIC_URL),
      );

      await svc.execute({ orderId: ORDER_ID, tenantId: TENANT_ID, transition: 'order_accepted' });

      expect(email.calls[0]?.vars.eta).toBe('19:45');
    });

    it('is absent from vars when etaAt is null', async () => {
      const email = makeEmailAdapter();
      const svc = new SendGuestNotificationService(
        email,
        makeBrandQueries(baseBrand),
        makeOrderRepo({ ...baseOrder, etaAt: null }),
        makeEnv(WEBSITE_PUBLIC_URL),
      );

      await svc.execute({
        orderId: ORDER_ID,
        tenantId: TENANT_ID,
        transition: 'order_confirmation',
      });

      expect(email.calls[0]?.vars.eta).toBeUndefined();
    });
  });

  describe('Growth HIGH-11: white-label brandName fallback removed', () => {
    it('does not send and logs an error when brand.displayName is missing', async () => {
      const email = makeEmailAdapter();
      const noNameBrand = { ...baseBrand, displayName: '' };
      const svc = new SendGuestNotificationService(
        email,
        makeBrandQueries(noNameBrand),
        makeOrderRepo(baseOrder),
        makeEnv(WEBSITE_PUBLIC_URL),
      );
      const errorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

      await expect(
        svc.execute({ orderId: ORDER_ID, tenantId: TENANT_ID, transition: 'order_confirmation' }),
      ).resolves.toBeUndefined();

      expect(email.sendGuestNotification).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledOnce();
      errorSpy.mockRestore();
    });
  });

  describe('Growth HIGH-10: status-page link', () => {
    it('vars.statusUrl contains the order id and the configured website origin', async () => {
      const email = makeEmailAdapter();
      const svc = new SendGuestNotificationService(
        email,
        makeBrandQueries(baseBrand),
        makeOrderRepo(baseOrder),
        makeEnv(WEBSITE_PUBLIC_URL),
      );

      await svc.execute({
        orderId: ORDER_ID,
        tenantId: TENANT_ID,
        transition: 'order_confirmation',
      });

      const statusUrl = email.calls[0]?.vars.statusUrl;
      expect(statusUrl).toContain(WEBSITE_PUBLIC_URL);
      expect(statusUrl).toContain(ORDER_ID);
    });

    it('falls back to a relative path when WEBSITE_PUBLIC_URL is unset', async () => {
      const email = makeEmailAdapter();
      const svc = new SendGuestNotificationService(
        email,
        makeBrandQueries(baseBrand),
        makeOrderRepo(baseOrder),
        makeEnv(undefined),
      );

      await svc.execute({
        orderId: ORDER_ID,
        tenantId: TENANT_ID,
        transition: 'order_confirmation',
      });

      expect(email.calls[0]?.vars.statusUrl).toBe(`/checkout/confirmation/${ORDER_ID}`);
    });
  });
});
