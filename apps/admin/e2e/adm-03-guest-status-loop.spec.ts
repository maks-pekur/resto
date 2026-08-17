import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { websiteBaseURL } from '../playwright.config';
import { seedPaidOrder } from './fixtures/seed-orders';

const API_ORIGIN = process.env.ADMIN_E2E_API_ORIGIN ?? 'http://localhost:5001';
const ADMIN_ORIGIN = process.env.ADMIN_E2E_BASE_URL ?? 'http://localhost:4000';
const INTERNAL_TOKEN = process.env.INTERNAL_API_TOKEN ?? 'internal_dev_token_change_me';
const TENANT_SLUG = process.env.ADM03_TENANT_SLUG ?? 'adm-03-guest-loop';
const PASSWORD = 'e2e-guest-loop-Pw!1';
const CURRENCY = 'USD';
const STATE_TIMEOUT = 15_000;

interface Seed {
  readonly tenantId: string;
  readonly brandSlug: string;
  readonly ownerEmail: string;
  readonly locationId: string;
  readonly itemId: string;
}

const internalHeaders = {
  'content-type': 'application/json',
  'x-internal-token': INTERNAL_TOKEN,
};

const extractCookie = (setCookieHeader: string | null): string => {
  if (!setCookieHeader) return '';
  return setCookieHeader
    .split(',')
    .map((c) => c.split(';')[0]?.trim() ?? '')
    .filter(Boolean)
    .join('; ');
};

const seedFixture = async (): Promise<Seed> => {
  const stamp = randomUUID().slice(0, 8);
  const ownerEmail = `adm-03-owner-${stamp}@e2e.test`;
  const brandSlug = `adm-03-brand-${stamp}`;

  const tenantRes = await fetch(`${API_ORIGIN}/internal/v1/tenants`, {
    method: 'POST',
    headers: internalHeaders,
    body: JSON.stringify({
      slug: TENANT_SLUG,
      displayName: 'ADM-03 Guest Loop',
      defaultCurrency: CURRENCY,
      locale: 'en',
    }),
  });
  if (tenantRes.status !== 201) {
    throw new Error(`provisionTenant -> ${String(tenantRes.status)} ${await tenantRes.text()}`);
  }
  const tenant = (await tenantRes.json()) as { id: string };

  const ownerRes = await fetch(`${API_ORIGIN}/internal/v1/tenants/${tenant.id}/owner`, {
    method: 'POST',
    headers: internalHeaders,
    body: JSON.stringify({ email: ownerEmail, password: PASSWORD, name: 'ADM-03 Owner' }),
  });
  if (ownerRes.status !== 201) {
    throw new Error(`bootstrapOwner -> ${String(ownerRes.status)} ${await ownerRes.text()}`);
  }

  const signInRes = await fetch(`${API_ORIGIN}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ADMIN_ORIGIN },
    body: JSON.stringify({ email: ownerEmail, password: PASSWORD }),
  });
  if (signInRes.status !== 200) {
    throw new Error(`signIn -> ${String(signInRes.status)} ${await signInRes.text()}`);
  }
  const cookie = extractCookie(signInRes.headers.get('set-cookie'));

  const setActiveOrgRes = await fetch(`${API_ORIGIN}/api/auth/organization/set-active`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie, origin: ADMIN_ORIGIN },
    body: JSON.stringify({ organizationId: tenant.id }),
  });
  if (setActiveOrgRes.status !== 200) {
    throw new Error(
      `setActiveOrg -> ${String(setActiveOrgRes.status)} ${await setActiveOrgRes.text()}`,
    );
  }
  const orgCookie = extractCookie(setActiveOrgRes.headers.get('set-cookie')) || cookie;

  const brandRes = await fetch(`${API_ORIGIN}/v1/me/brands`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: orgCookie, 'x-tenant-id': tenant.id },
    body: JSON.stringify({ slug: brandSlug, displayName: `ADM-03 Brand ${stamp}` }),
  });
  if (brandRes.status !== 201) {
    throw new Error(`createBrand -> ${String(brandRes.status)} ${await brandRes.text()}`);
  }

  const brandHeaders = {
    'content-type': 'application/json',
    cookie: orgCookie,
    'x-tenant-id': tenant.id,
    'x-brand-slug': brandSlug,
  };

  const locationRes = await fetch(`${API_ORIGIN}/v1/tenancy/locations`, {
    method: 'POST',
    headers: brandHeaders,
    body: JSON.stringify({ name: 'ADM-03 Location' }),
  });
  if (locationRes.status !== 200) {
    throw new Error(`createLocation -> ${String(locationRes.status)} ${await locationRes.text()}`);
  }
  const locationId = ((await locationRes.json()) as { id: string }).id;

  const catRes = await fetch(`${API_ORIGIN}/v1/catalog/categories`, {
    method: 'POST',
    headers: brandHeaders,
    body: JSON.stringify({ slug: 'adm-03-cat', name: { en: 'ADM-03 Category' }, sortOrder: 0 }),
  });
  if (catRes.status !== 200) {
    throw new Error(`createCategory -> ${String(catRes.status)} ${await catRes.text()}`);
  }
  const categoryId = ((await catRes.json()) as { id: string }).id;

  const itemRes = await fetch(`${API_ORIGIN}/v1/catalog/items`, {
    method: 'POST',
    headers: brandHeaders,
    body: JSON.stringify({
      categoryId,
      slug: 'adm-03-item',
      name: { en: 'ADM-03 Item' },
      basePrice: '9.00',
      currency: CURRENCY,
      status: 'published',
    }),
  });
  if (itemRes.status !== 200) {
    throw new Error(`createItem -> ${String(itemRes.status)} ${await itemRes.text()}`);
  }
  const itemId = ((await itemRes.json()) as { id: string }).id;

  return { tenantId: tenant.id, brandSlug, ownerEmail, locationId, itemId };
};

test.describe('ADM-03 two-screen guest status loop (load-bearing, real browser)', () => {
  test('guest tracker advances live while an operator taps buttons', async ({ browser }) => {
    test.setTimeout(180_000);
    const seed = await seedFixture();

    const orderAccept = await seedPaidOrder({
      apiOrigin: API_ORIGIN,
      tenantId: seed.tenantId,
      brandSlug: seed.brandSlug,
      itemId: seed.itemId,
      locationId: seed.locationId,
    });
    const orderReject = await seedPaidOrder({
      apiOrigin: API_ORIGIN,
      tenantId: seed.tenantId,
      brandSlug: seed.brandSlug,
      itemId: seed.itemId,
      locationId: seed.locationId,
    });

    const guestContext = await browser.newContext();
    const guestPage = await guestContext.newPage();
    await guestPage.goto(`${websiteBaseURL}/checkout/confirmation/${orderAccept.id}`);

    await expect(guestPage.getByText(`Заказ №${String(orderAccept.shortNumber)}`)).toBeVisible();
    await expect(guestPage.locator('span.text-foreground', { hasText: 'Оплачен' })).toBeVisible();
    await expect(guestPage.getByText('Ресторан скоро примет ваш заказ')).toBeVisible();
    await expect(guestPage.locator('body')).not.toContainText(orderAccept.orderNumber);

    const opContext = await browser.newContext();
    const opPage = await opContext.newPage();
    await opPage.goto('/login');
    await opPage.getByLabel('Email').fill(seed.ownerEmail);
    await opPage.getByLabel('Password').fill(PASSWORD);
    await opPage.getByRole('button', { name: 'Sign in' }).click();
    await opPage.waitForURL(new RegExp(`/${seed.brandSlug}(\\?|$)`), { timeout: 15_000 });
    await opPage.goto(`/${seed.brandSlug}/orders`);

    await opPage.getByRole('combobox', { name: 'Статус' }).click();
    await opPage.getByRole('option', { name: 'Все за сегодня' }).click();
    await expect(opPage.getByRole('combobox', { name: 'Статус' })).toContainText('Все за сегодня');

    const opCardAccept = opPage.getByTestId(`order-card-${orderAccept.id}`);
    await expect(opCardAccept).toBeVisible({ timeout: STATE_TIMEOUT });
    await opCardAccept.getByRole('button', { name: 'Принять' }).click();
    await opPage.getByRole('button', { name: '20 мин' }).click();
    await expect(opCardAccept.getByText('Принят', { exact: true })).toBeVisible({
      timeout: STATE_TIMEOUT,
    });

    await expect(guestPage.locator('span.text-foreground', { hasText: 'Принят' })).toBeVisible({
      timeout: 30_000,
    });
    await expect(guestPage.getByText(/Будет готово к/)).toBeVisible();

    await opCardAccept.getByRole('button', { name: 'Готовится' }).click();
    await expect(opCardAccept.getByText('Готовится', { exact: true })).toBeVisible({
      timeout: STATE_TIMEOUT,
    });
    await expect(guestPage.locator('span.text-foreground', { hasText: 'Готовится' })).toBeVisible({
      timeout: 30_000,
    });

    await opCardAccept.getByRole('button', { name: 'Готово' }).click();
    await expect(opCardAccept.getByText('Готово', { exact: true })).toBeVisible({
      timeout: STATE_TIMEOUT,
    });
    await expect(guestPage.locator('span.text-foreground', { hasText: 'Готово' })).toBeVisible({
      timeout: 30_000,
    });
    await expect(guestPage.locator('body')).not.toContainText(/в пути|курьер|dispatch/i);

    const guestPage2 = await guestContext.newPage();
    await guestPage2.goto(`${websiteBaseURL}/checkout/confirmation/${orderReject.id}`);
    await expect(guestPage2.getByText(`Заказ №${String(orderReject.shortNumber)}`)).toBeVisible();

    const opCardReject = opPage.getByTestId(`order-card-${orderReject.id}`);
    await opCardReject.getByRole('button', { name: 'Отклонить' }).click();
    await opPage.getByRole('button', { name: 'Нет в наличии' }).click();
    await expect(opCardReject.getByText('Отменён', { exact: true })).toBeVisible({
      timeout: STATE_TIMEOUT,
    });

    await expect(guestPage2.getByText('Ресторан не смог принять ваш заказ')).toBeVisible({
      timeout: 30_000,
    });
    await expect(guestPage2.getByText(/этого блюда сейчас нет в наличии/i)).toBeVisible();
    await expect(guestPage2.getByText(/Возврат/)).toBeVisible();
    await expect(guestPage2.locator('body')).not.toContainText(/отклонён|declined|rejected/i);
  });
});
