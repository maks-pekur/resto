import { randomUUID } from 'node:crypto';
import { test, expect, type Page } from '@playwright/test';
import {
  seedPaidOrder,
  seedPaidOrderAtOtherLocation,
  bootstrapStaffMember,
  activateStaffOrg,
} from './fixtures/seed-orders';

const API_ORIGIN = process.env.ADMIN_E2E_API_ORIGIN ?? 'http://localhost:5001';
const ADMIN_ORIGIN = process.env.ADMIN_E2E_BASE_URL ?? 'http://localhost:4000';
const INTERNAL_TOKEN = process.env.INTERNAL_API_TOKEN ?? 'internal_dev_token_change_me';
const PASSWORD = 'e2e-orders-workflow-Pw!1';
const CURRENCY = 'USD';
const LOCATION_A_NAME = 'Location A';
const LOCATION_B_NAME = 'Location B';

const money = (amount: string, currency: string): string =>
  new Intl.NumberFormat('ru-RU', { style: 'currency', currency }).format(Number(amount));

const STATE_TIMEOUT = 15_000;

interface Seed {
  readonly brandSlug: string;
  readonly tenantId: string;
  readonly brandId: string;
  readonly ownerEmail: string;
  readonly staffEmail: string;
  readonly staffSessionCookie: string;
  readonly locationAId: string;
  readonly locationBId: string;
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
  const tenantSlug = `adm-02-${stamp}`;
  const ownerEmail = `adm-02-owner-${stamp}@e2e.test`;
  const staffEmail = `adm-02-staff-${stamp}@e2e.test`;
  const brandSlug = `adm-02-brand-${stamp}`;

  const tenantRes = await fetch(`${API_ORIGIN}/internal/v1/tenants`, {
    method: 'POST',
    headers: internalHeaders,
    body: JSON.stringify({
      slug: tenantSlug,
      displayName: `ADM-02 ${stamp}`,
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
    body: JSON.stringify({ email: ownerEmail, password: PASSWORD, name: 'ADM-02 Owner' }),
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
    body: JSON.stringify({ slug: brandSlug, displayName: `ADM-02 Brand ${stamp}` }),
  });
  if (brandRes.status !== 201) {
    throw new Error(`createBrand -> ${String(brandRes.status)} ${await brandRes.text()}`);
  }
  const brand = (await brandRes.json()) as { id: string };

  const brandHeaders = {
    'content-type': 'application/json',
    cookie: orgCookie,
    'x-tenant-id': tenant.id,
    'x-brand-slug': brandSlug,
  };

  const createLocation = async (name: string): Promise<string> => {
    const res = await fetch(`${API_ORIGIN}/v1/tenancy/locations`, {
      method: 'POST',
      headers: brandHeaders,
      body: JSON.stringify({ name }),
    });
    if (res.status !== 200) {
      throw new Error(`createLocation(${name}) -> ${String(res.status)} ${await res.text()}`);
    }
    return ((await res.json()) as { id: string }).id;
  };
  const locationAId = await createLocation(LOCATION_A_NAME);

  const staff = await bootstrapStaffMember({
    apiOrigin: API_ORIGIN,
    originHeader: ADMIN_ORIGIN,
    tenantId: tenant.id,
    email: staffEmail,
    password: PASSWORD,
    name: 'ADM-02 Staff',
  });
  const assignRes = await fetch(`${API_ORIGIN}/v1/members/${staff.memberId}/location-roles`, {
    method: 'POST',
    headers: brandHeaders,
    body: JSON.stringify({ locationId: locationAId, roleSlug: 'cashier-foh' }),
  });
  if (assignRes.status !== 200) {
    throw new Error(`assignLocationRole -> ${String(assignRes.status)} ${await assignRes.text()}`);
  }
  const staffSessionCookie = await activateStaffOrg({
    apiOrigin: API_ORIGIN,
    originHeader: ADMIN_ORIGIN,
    tenantId: tenant.id,
    preActivationCookie: staff.preActivationCookie,
  });
  const assignRoleRes = await fetch(`${API_ORIGIN}/v1/roles/cashier-foh/assign`, {
    method: 'POST',
    headers: brandHeaders,
    body: JSON.stringify({ memberId: staff.memberId, role: 'cashier-foh' }),
  });
  if (assignRoleRes.status !== 200) {
    throw new Error(`assignRole -> ${String(assignRoleRes.status)} ${await assignRoleRes.text()}`);
  }

  const locationBId = await createLocation(LOCATION_B_NAME);

  const catRes = await fetch(`${API_ORIGIN}/v1/catalog/categories`, {
    method: 'POST',
    headers: brandHeaders,
    body: JSON.stringify({ slug: 'adm-02-cat', name: { en: 'ADM-02 Category' }, sortOrder: 0 }),
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
      slug: 'adm-02-item',
      name: { en: 'ADM-02 Item' },
      basePrice: '9.00',
      currency: CURRENCY,
      status: 'published',
    }),
  });
  if (itemRes.status !== 200) {
    throw new Error(`createItem -> ${String(itemRes.status)} ${await itemRes.text()}`);
  }
  const itemId = ((await itemRes.json()) as { id: string }).id;

  return {
    brandSlug,
    tenantId: tenant.id,
    brandId: brand.id,
    ownerEmail,
    staffEmail,
    staffSessionCookie,
    locationAId,
    locationBId,
    itemId,
  };
};

const trackApiFailures = (page: Page): (() => Promise<string[]>) => {
  const pending: Promise<string | null>[] = [];
  page.on('response', (response) => {
    const url = response.url();
    if (!url.includes('/v1/')) return;
    pending.push(
      (async (): Promise<string | null> => {
        const status = response.status();
        let bodyCode: string | undefined;
        try {
          const json = (await response.json()) as { code?: string };
          bodyCode = json.code;
        } catch {
          bodyCode = undefined;
        }
        if (status === 403) {
          return `${String(status)} ${bodyCode ?? ''} ${url}`;
        }
        return null;
      })(),
    );
  });
  return async () => {
    const results = await Promise.all(pending);
    return results.filter((r): r is string => r !== null);
  };
};

const signIn = async (page: Page, email: string, brandSlug: string): Promise<void> => {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(new RegExp(`/${brandSlug}(\\?|$)`), { timeout: 15_000 });
};

const signInViaSessionCookie = async (
  page: Page,
  sessionCookie: string,
  brandSlug: string,
): Promise<void> => {
  const [name, ...rest] = sessionCookie.split('=');
  const value = rest.join('=');
  await page.context().addCookies([
    {
      name: name ?? '',
      value,
      url: ADMIN_ORIGIN,
    },
  ]);
  await page.goto(`/${brandSlug}/orders`);
};

test.describe('ADM-02 orders workflow smoke (load-bearing, real browser)', () => {
  test('operator drives accept, kitchen advance, reject, cancel-after-accept, all-mode and the non-owner boundary', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    const getFailures = trackApiFailures(page);

    const seed = await seedFixture();

    const orderAccept = await seedPaidOrder({
      apiOrigin: API_ORIGIN,
      tenantId: seed.tenantId,
      brandSlug: seed.brandSlug,
      itemId: seed.itemId,
      locationId: seed.locationAId,
    });
    const orderReject = await seedPaidOrder({
      apiOrigin: API_ORIGIN,
      tenantId: seed.tenantId,
      brandSlug: seed.brandSlug,
      itemId: seed.itemId,
      locationId: seed.locationAId,
    });
    const orderCancelAfterAccept = await seedPaidOrder({
      apiOrigin: API_ORIGIN,
      tenantId: seed.tenantId,
      brandSlug: seed.brandSlug,
      itemId: seed.itemId,
      locationId: seed.locationAId,
    });
    const orderAllModeLocB = await seedPaidOrderAtOtherLocation({
      tenantId: seed.tenantId,
      brandId: seed.brandId,
      locationId: seed.locationBId,
      shortNumber: 1,
      amount: '9.00',
      currency: CURRENCY,
    });

    await test.step('sign in as owner', async () => {
      await signIn(page, seed.ownerEmail, seed.brandSlug);
    });

    await test.step('case 1 + 9: feed renders, no 403, tab title shows unaccepted count and restores', async () => {
      const baseTitle = await page.title();
      await page.goto(`/${seed.brandSlug}/orders`);
      const card = page.getByTestId(`order-card-${orderAccept.id}`);
      await expect(card).toBeVisible();
      await expect(card).toContainText(`№${String(orderAccept.shortNumber)}`);
      await expect(card).not.toContainText(orderAccept.orderNumber);
      await expect.poll(() => page.title()).toMatch(/^\(\d+\) Заказы$/);
      expect(await getFailures()).toEqual([]);

      await page.goto(`/${seed.brandSlug}`);
      await expect.poll(() => page.title()).toBe(baseTitle);
      await page.goto(`/${seed.brandSlug}/orders`);
    });

    await test.step('switch status filter to Все за сегодня so completed/canceled orders stay visible', async () => {
      await page.getByRole('combobox', { name: 'Статус' }).click();
      await page.getByRole('option', { name: 'Все за сегодня' }).click();
      await expect(page.getByRole('combobox', { name: 'Статус' })).toContainText('Все за сегодня');
    });

    await test.step('case 2a: Ждут sorts oldest-first', async () => {
      const waitingSection = page.locator('section', { hasText: 'Ждут' }).first();
      const firstCard = waitingSection.locator('[data-testid^="order-card-"]').first();
      await expect(firstCard).toHaveAttribute('data-testid', `order-card-${orderAccept.id}`);
    });

    await test.step('case 3: accept with ETA — two taps, no intermediate confirm', async () => {
      const card = page.getByTestId(`order-card-${orderAccept.id}`);
      await card.getByRole('button', { name: 'Принять' }).click();
      await expect(page.getByRole('button', { name: '15 мин' })).toBeVisible();
      await expect(page.getByRole('button', { name: '20 мин' })).toBeVisible();
      await expect(page.getByRole('button', { name: '30 мин' })).toBeVisible();
      await expect(page.getByRole('button', { name: '45 мин' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Другое' })).toBeVisible();
      await page.getByRole('button', { name: '20 мин' }).click();
      await expect(
        page.getByText(new RegExp(`Заказ №${String(orderAccept.shortNumber)} принят`)),
      ).toBeVisible({ timeout: STATE_TIMEOUT });
      await expect(card.getByText('Принят', { exact: true })).toBeVisible({
        timeout: STATE_TIMEOUT,
      });
    });

    await test.step('case 2b: Ждут renders above В работе', async () => {
      const headings = await page.locator('h2').allTextContents();
      const waitingIdx = headings.indexOf('Ждут');
      const inProgressIdx = headings.indexOf('В работе');
      expect(waitingIdx).toBeGreaterThanOrEqual(0);
      expect(inProgressIdx).toBeGreaterThan(waitingIdx);
    });

    await test.step('case 4: advance through the kitchen', async () => {
      const card = page.getByTestId(`order-card-${orderAccept.id}`);
      await card.getByRole('button', { name: 'Готовится' }).click();
      await expect(card.getByText('Готовится', { exact: true })).toBeVisible({
        timeout: STATE_TIMEOUT,
      });
      await card.getByRole('button', { name: 'Готово' }).click();
      await expect(card.getByText('Готово', { exact: true })).toBeVisible({
        timeout: STATE_TIMEOUT,
      });
      await card.getByRole('button', { name: 'Выдан' }).click();
      await expect(card.getByText('Завершён', { exact: true })).toBeVisible({
        timeout: STATE_TIMEOUT,
      });
    });

    await test.step('case 2c: Ждут renders above Завершены', async () => {
      const headings = await page.locator('h2').allTextContents();
      const waitingIdx = headings.indexOf('Ждут');
      const doneIdx = headings.indexOf('Завершены');
      expect(waitingIdx).toBeGreaterThanOrEqual(0);
      expect(doneIdx).toBeGreaterThan(waitingIdx);
    });

    await test.step('case 5: reject — two taps, trigger not destructive-solid', async () => {
      const card = page.getByTestId(`order-card-${orderReject.id}`);
      const rejectBtn = card.getByRole('button', { name: 'Отклонить' });
      const classAttr = await rejectBtn.getAttribute('class');
      expect(classAttr ?? '').not.toContain('bg-destructive');
      await rejectBtn.click();
      for (const label of [
        'Нет в наличии',
        'Кухня перегружена',
        'Гость отменил',
        'Гость не выходит на связь',
        'Проблема с оплатой',
        'Дубликат заказа',
        'Другая причина',
      ]) {
        await expect(page.getByRole('button', { name: label })).toBeVisible();
      }
      await page.getByRole('button', { name: 'Нет в наличии' }).click();
      await expect(card.getByText('Отменён', { exact: true })).toBeVisible({
        timeout: STATE_TIMEOUT,
      });
      const amount = money(orderReject.total, orderReject.currency);
      await expect(
        page.getByText(new RegExp(`Заказ №${String(orderReject.shortNumber)} отклонён`)),
      ).toBeVisible({ timeout: STATE_TIMEOUT });
      await expect(page.getByText(amount, { exact: false })).toBeVisible();
    });

    await test.step('case 6: accept a third order, then cancel-after-accept from the detail Sheet', async () => {
      const card = page.getByTestId(`order-card-${orderCancelAfterAccept.id}`);
      await card.getByRole('button', { name: 'Принять' }).click();
      await page.getByRole('button', { name: '15 мин' }).click();
      await expect(card.getByText('Принят', { exact: true })).toBeVisible({
        timeout: STATE_TIMEOUT,
      });

      await card.getByText(new RegExp(`№${String(orderCancelAfterAccept.shortNumber)}`)).click();
      const sheet = page.getByRole('dialog');
      await expect(sheet.getByText('Состав заказа')).toBeVisible();
      await expect(sheet.getByText('Гость')).toBeVisible();
      await expect(sheet.getByText('История заказа')).toBeVisible();
      await expect(sheet.getByText('Принят', { exact: true }).first()).toBeVisible();
      await expect(sheet.getByText(/\d{1,2}\.\d{1,2}\.\d{4}/).first()).toBeVisible();

      await sheet.getByRole('button', { name: 'Отменить заказ' }).click();
      const dialog = page.getByRole('alertdialog');
      const amount = money(orderCancelAfterAccept.total, orderCancelAfterAccept.currency);
      await expect(dialog).toContainText(amount);
      const confirmBtn = dialog.getByRole('button', { name: new RegExp('Отменить и вернуть') });
      await expect(confirmBtn).toContainText(amount);
      await expect(confirmBtn).toBeDisabled();

      await dialog.getByLabel('Причина').click();
      await page.getByRole('option', { name: 'Нет в наличии' }).click();
      await expect(confirmBtn).toBeEnabled();
      await confirmBtn.click();

      await expect(card.getByText('Отменён', { exact: true })).toBeVisible({
        timeout: STATE_TIMEOUT,
      });
    });

    await test.step('case 7: owner in ?location=all mutates a location-2 order with no 403', async () => {
      await page.getByTestId('location-switcher-trigger').click();
      await page.getByTestId('location-switcher-all').click();
      await page.waitForURL(/location=all/, { timeout: 10_000 });
      const cardA = page.getByTestId(`order-card-${orderAllModeLocB.id}`);
      await expect(cardA).toBeVisible();
      await expect(cardA.getByText(LOCATION_B_NAME)).toBeVisible();
      await cardA.getByRole('button', { name: 'Принять' }).click();
      await page.getByRole('button', { name: '15 мин' }).click();
      await expect(cardA.getByText('Принят', { exact: true })).toBeVisible({
        timeout: STATE_TIMEOUT,
      });
      expect(await getFailures()).toEqual([]);
    });

    await test.step('case 8: non-owner boundary', async () => {
      const orderNonOwnerCancel = await seedPaidOrder({
        apiOrigin: API_ORIGIN,
        tenantId: seed.tenantId,
        brandSlug: seed.brandSlug,
        itemId: seed.itemId,
        locationId: seed.locationAId,
      });

      await signInViaSessionCookie(page, seed.staffSessionCookie, seed.brandSlug);

      await page.getByRole('combobox', { name: 'Статус' }).click();
      await page.getByRole('option', { name: 'Все за сегодня' }).click();
      await expect(page.getByRole('combobox', { name: 'Статус' })).toContainText('Все за сегодня');

      const card = page.getByTestId(`order-card-${orderNonOwnerCancel.id}`);
      await expect(card).toBeVisible({ timeout: STATE_TIMEOUT });
      await card.getByText(new RegExp(`№${String(orderNonOwnerCancel.shortNumber)}`)).click();
      const sheet = page.getByRole('dialog');
      await expect(sheet.getByRole('heading', { name: 'Возврат', level: 3 })).toHaveCount(0);

      await sheet.getByRole('button', { name: 'Отменить заказ' }).click();
      const dialog = page.getByRole('alertdialog');
      await dialog.getByLabel('Причина').click();
      await page.getByRole('option', { name: 'Нет в наличии' }).click();
      await dialog.getByRole('button', { name: new RegExp('Отменить и вернуть') }).click();

      await expect(card.getByText('Отменён', { exact: true })).toBeVisible({
        timeout: STATE_TIMEOUT,
      });
      expect(await getFailures()).toEqual([]);
    });

    expect(consoleErrors).toEqual([]);
  });
});
