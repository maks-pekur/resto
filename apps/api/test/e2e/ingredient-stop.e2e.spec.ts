import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { IMAGE_URL_PORT } from '../../src/contexts/catalog/domain/ports';
import {
  isDockerAvailable,
  startRealStack,
  stopRealStack,
  type RealStack,
} from './with-real-stack.setup';
import { provisionTenant, runBootstrap, signInAsOperator } from './helpers/operator-fixture';

const dockerOk = isDockerAvailable();
const suite = dockerOk ? describe : describe.skip;

if (!dockerOk) {
  console.warn('[ingredient-stop.e2e] Docker not available — skipping integration tests.');
}

const INTERNAL_TOKEN = 'integration-test-token-1234567890';
const PASSWORD = 'Sup3r-Secret-Pw!';

interface AuthedTenant {
  id: string;
  slug: string;
  menuHost: string;
  authed: {
    cookie: string;
    'x-tenant-id': string;
    'x-location-id': string;
  };
}

const setupAuthedTenant = async (
  app: NestFastifyApplication,
  label: string,
): Promise<AuthedTenant> => {
  const slug = `${label}-${randomUUID().slice(0, 8)}`;
  const email = `owner-${randomUUID().slice(0, 8)}@example.com`;
  const tenant = await provisionTenant(app, slug, INTERNAL_TOKEN);
  await runBootstrap({
    tenantSlug: slug,
    email,
    password: PASSWORD,
    name: 'Ingredient Stop Owner',
  });
  const ownerCookie = await signInAsOperator(app, email, PASSWORD, tenant.id);

  const locationRes = await app.inject({
    method: 'POST',
    url: '/v1/tenancy/locations',
    headers: { cookie: ownerCookie, 'x-tenant-id': tenant.id },
    payload: {
      name: `${label} location`,
      address: '1 Test Street, London',
      latitude: 51.5074,
      longitude: -0.1278,
    },
  });
  expect(locationRes.statusCode).toBe(200);
  const locationId = locationRes.json<{ id: string }>().id;

  return {
    id: tenant.id,
    slug,
    menuHost: `${slug}.menu.resto.app`,
    authed: {
      cookie: ownerCookie,
      'x-tenant-id': tenant.id,
      'x-location-id': locationId,
    },
  };
};

suite(
  'Ingredient stop list — availability overlay, menu completeness, order refusal (D-20/D-21/D-24/D-25)',
  () => {
    let stack: RealStack;
    let cafe: AuthedTenant;
    let itemId: string;
    let optionId: string;

    beforeAll(async () => {
      process.env.REQUIRE_EMAIL_VERIFICATION = 'false';
      process.env.RATE_LIMIT_AUTH_SIGNIN_PER_MIN = '1000';
      process.env.RATE_LIMIT_AUTH_SIGNIN_PER_EMAIL_PER_MIN = '1000';
      process.env.RATE_LIMIT_INTERNAL_PER_MIN = '10000';

      stack = await startRealStack({
        natsEnabledInApp: false,
        overrideProviders: [
          {
            provide: IMAGE_URL_PORT,
            useValue: {
              presignGet: (key: string, ttl: number): Promise<string> =>
                Promise.resolve(`https://signed.test/${key}?expires=${ttl.toString()}`),
            },
          },
        ],
      });

      cafe = await setupAuthedTenant(stack.app, 'ing-stop');

      const categoryRes = await stack.app.inject({
        method: 'POST',
        url: '/v1/catalog/categories',
        headers: cafe.authed,
        payload: { slug: 'ing-stop-cat', name: { en: 'Ingredient stop cat' }, sortOrder: 0 },
      });
      expect(categoryRes.statusCode).toBe(200);
      const categoryId = categoryRes.json<{ id: string }>().id;

      const itemRes = await stack.app.inject({
        method: 'POST',
        url: '/v1/catalog/items',
        headers: cafe.authed,
        payload: {
          categoryId,
          slug: 'ing-stop-item',
          name: { en: 'Ingredient stop item' },
          basePrice: '10.00',
          currency: 'USD',
          status: 'published',
        },
      });
      expect(itemRes.statusCode).toBe(200);
      itemId = itemRes.json<{ id: string }>().id;

      const optionRes = await stack.app.inject({
        method: 'POST',
        url: '/v1/catalog/modifier-options',
        headers: cafe.authed,
        payload: { name: { en: 'Bacon' }, priceDelta: '1.50' },
      });
      expect(optionRes.statusCode).toBe(200);
      optionId = optionRes.json<{ id: string }>().id;

      const attachRes = await stack.app.inject({
        method: 'PUT',
        url: `/v1/catalog/items/${itemId}/modifier-options`,
        headers: cafe.authed,
        payload: { optionIds: [optionId] },
      });
      expect(attachRes.statusCode).toBe(200);

      const publishRes = await stack.app.inject({
        method: 'POST',
        url: '/v1/catalog/publish',
        headers: cafe.authed,
      });
      expect(publishRes.statusCode).toBe(200);
    }, 180_000);

    afterAll(async () => {
      await stopRealStack(stack);
    });

    it('starts with nothing stopped', async () => {
      const res = await stack.app.inject({
        method: 'GET',
        url: '/v1/menu/availability',
        headers: { host: cafe.menuHost },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json<{ stoppedItemIds: string[]; stoppedIngredientIds: string[] }>();
      expect(body.stoppedIngredientIds).not.toContain(optionId);
      expect(body.stoppedItemIds).toEqual([]);
    });

    it('stopping the ingredient adds it to availability.stoppedIngredientIds without touching stoppedItemIds, and /v1/menu still contains it (D-20/D-21)', async () => {
      const stopRes = await stack.app.inject({
        method: 'POST',
        url: '/v1/catalog/stop-list/options',
        headers: cafe.authed,
        payload: { optionId },
      });
      expect(stopRes.statusCode).toBe(200);

      const availRes = await stack.app.inject({
        method: 'GET',
        url: '/v1/menu/availability',
        headers: { host: cafe.menuHost },
      });
      expect(availRes.statusCode).toBe(200);
      const availBody = availRes.json<{
        stoppedItemIds: string[];
        stoppedIngredientIds: string[];
      }>();
      expect(availBody.stoppedIngredientIds).toContain(optionId);
      expect(availBody.stoppedItemIds).toEqual([]);

      const menuRes = await stack.app.inject({
        method: 'GET',
        url: '/v1/menu',
        headers: { host: cafe.menuHost },
      });
      expect(menuRes.statusCode).toBe(200);
      const menu = menuRes.json<{ modifierOptions: { id: string }[] }>();
      expect(menu.modifierOptions.map((o) => o.id)).toContain(optionId);
    });

    it('an order carrying the stopped ingredient is refused with ordering.modifier_unavailable (D-24)', async () => {
      const res = await stack.app.inject({
        method: 'POST',
        url: '/v1/orders',
        headers: { 'x-tenant-id': cafe.id, 'content-type': 'application/json' },
        payload: {
          items: [
            {
              itemId,
              sizeId: null,
              name: 'Ingredient stop item',
              quantity: 1,
              modifiers: [{ optionId, name: 'Bacon', kind: 'added' }],
            },
          ],
          orderType: 'dine_in',
          idempotencyKey: randomUUID(),
        },
      });
      expect(res.statusCode).toBe(422);
      expect(res.json<{ code?: string }>().code).toBe('ordering.modifier_unavailable');
    });

    it('resuming the ingredient removes it from availability.stoppedIngredientIds, stoppedItemIds stays empty throughout (D-25)', async () => {
      const resumeRes = await stack.app.inject({
        method: 'DELETE',
        url: `/v1/catalog/stop-list/options/${optionId}`,
        headers: cafe.authed,
      });
      expect(resumeRes.statusCode).toBe(204);

      const availRes = await stack.app.inject({
        method: 'GET',
        url: '/v1/menu/availability',
        headers: { host: cafe.menuHost },
      });
      expect(availRes.statusCode).toBe(200);
      const availBody = availRes.json<{
        stoppedItemIds: string[];
        stoppedIngredientIds: string[];
      }>();
      expect(availBody.stoppedIngredientIds).not.toContain(optionId);
      expect(availBody.stoppedItemIds).toEqual([]);
    });
  },
);
