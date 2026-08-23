import { randomUUID } from 'node:crypto';
import { test, expect, type Page } from '@playwright/test';

// D-17 (load-bearing): a REAL browser smoke — not a mocked-repo unit test
// (that exact bug class was missed in 08.4, see project memory "verify
// feature, not call shape"). Seeds a real tenant/brand/2 locations/item via
// the live apps/api (no mocks), signs in through the real /login form, and
// walks the owner through `?location=all` on both the dashboard and the
// dedicated stop-list page, asserting zero 403 / `location.context_required`
// responses across the whole walk. Then switches to a concrete location and
// asserts the write (stop/unstop) affordance reappears (D-05).

const API_ORIGIN = process.env.ADMIN_E2E_API_ORIGIN ?? 'http://localhost:5001';
const ADMIN_ORIGIN = process.env.ADMIN_E2E_BASE_URL ?? 'http://localhost:4000';
const INTERNAL_TOKEN = process.env.INTERNAL_API_TOKEN ?? 'internal_dev_token_change_me';
const PASSWORD = 'e2e-all-mode-Pw!1';

interface Seed {
  readonly brandSlug: string;
  readonly ownerEmail: string;
  readonly locationAId: string;
  readonly locationBId: string;
  readonly itemId: string;
  // The stop-list-entry id (StopListItemApi.id) — distinct from the catalog
  // item id. The aggregate row is keyed by itemId; the single-location
  // StopListTable row is keyed by the stop-list entry id.
  readonly stopEntryId: string;
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

// Real (non-mocked) seeding against the live apps/api — mirrors the
// conventions in apps/admin/e2e/fixtures/seed-tenants.ts and
// apps/api/test/e2e/helpers/operator-fixture.ts (provisionTenant /
// runBootstrap / signInAsOperator), adapted to plain fetch since this file
// seeds over HTTP rather than via Fastify's `app.inject()`.
const seedOwnerAllModeFixture = async (): Promise<Seed> => {
  const stamp = randomUUID().slice(0, 8);
  const tenantSlug = `adm-01-${stamp}`;
  const ownerEmail = `adm-01-owner-${stamp}@e2e.test`;
  const brandSlug = `adm-01-brand-${stamp}`;

  const tenantRes = await fetch(`${API_ORIGIN}/internal/v1/tenants`, {
    method: 'POST',
    headers: internalHeaders,
    body: JSON.stringify({
      slug: tenantSlug,
      displayName: `ADM-01 ${stamp}`,
      defaultCurrency: 'USD',
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
    body: JSON.stringify({ email: ownerEmail, password: PASSWORD, name: 'ADM-01 Owner' }),
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
    body: JSON.stringify({ slug: brandSlug, displayName: `ADM-01 Brand ${stamp}` }),
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
  const locationAId = await createLocation('Location A');
  const locationBId = await createLocation('Location B');

  const catRes = await fetch(`${API_ORIGIN}/v1/catalog/categories`, {
    method: 'POST',
    headers: brandHeaders,
    body: JSON.stringify({ slug: 'adm-01-cat', name: { en: 'ADM-01 Category' }, sortOrder: 0 }),
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
      slug: 'adm-01-item',
      name: { en: 'ADM-01 Item' },
      basePrice: '9.00',
      currency: 'USD',
      status: 'published',
    }),
  });
  if (itemRes.status !== 200) {
    throw new Error(`createItem -> ${String(itemRes.status)} ${await itemRes.text()}`);
  }
  const itemId = ((await itemRes.json()) as { id: string }).id;

  const stopRes = await fetch(`${API_ORIGIN}/v1/catalog/stop-list`, {
    method: 'POST',
    headers: { ...brandHeaders, 'x-location-id': locationAId },
    body: JSON.stringify({ itemId, reason: '86' }),
  });
  if (stopRes.status !== 200) {
    throw new Error(`stopItem -> ${String(stopRes.status)} ${await stopRes.text()}`);
  }
  const stopEntryId = ((await stopRes.json()) as { id: string }).id;

  return { brandSlug, ownerEmail, locationAId, locationBId, itemId, stopEntryId };
};

// Fails the walk if any /v1/* response is a 403, OR a JSON body carries the
// `location.context_required` code — the exact 08.4 bug class this closes.
// Each response is captured as a PROMISE (not fire-and-forget) so
// `getFailures()` can await every in-flight body read before asserting —
// otherwise a fast synchronous check could race the async `.json()` parse.
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
        if (status === 403 || bodyCode === 'location.context_required') {
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

test.describe('ADM-01 all-mode smoke (D-17, load-bearing)', () => {
  test('owner in ?location=all loads dashboard + stop-list with zero 403s, single mode restores stop/unstop', async ({
    page,
  }) => {
    const seed = await seedOwnerAllModeFixture();
    const getFailures = trackApiFailures(page);

    await page.goto('/login');
    await page.getByLabel('Email').fill(seed.ownerEmail);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL(new RegExp(`/${seed.brandSlug}(\\?|$)`), { timeout: 15_000 });

    // Step 1 — dashboard in `all` mode: aggregate branch, no white-screen.
    await page.goto(`/${seed.brandSlug}?location=all`);
    await expect(page.getByTestId('todays-widget-count')).toHaveText('1');
    expect(await getFailures()).toEqual([]);

    // Step 2 — dedicated stop-list page in `all` mode: N/M badge, read-only.
    await page.goto(`/${seed.brandSlug}/menu/stop-list?location=all`);
    await expect(page.getByTestId('stop-list-readonly-notice')).toBeVisible();
    const badge = page.getByTestId(`stop-aggregate-badge-${seed.itemId}`);
    await expect(badge).toBeVisible();
    await expect(badge).toContainText('1/2');
    await expect(page.getByTestId(`stop-row-${seed.stopEntryId}`)).not.toBeVisible();
    expect(await getFailures()).toEqual([]);

    // Step 3 — the switcher is a pure client-side filter: no server
    // round-trip, no window.location.reload (D-01/D-04).
    await page.getByTestId('location-switcher-trigger').click();
    await page.getByTestId(`location-switcher-option-${seed.locationAId}`).click();
    await page.waitForURL(new RegExp(`location=${seed.locationAId}`), { timeout: 10_000 });

    // Step 4 — single-location mode: stop/unstop affordance reappears (D-05).
    const row = page.getByTestId(`stop-row-${seed.stopEntryId}`);
    await expect(row).toBeVisible();
    await expect(row.getByRole('switch')).toBeVisible();
    expect(await getFailures()).toEqual([]);
  });
});
