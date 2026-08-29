import { type CountryCodeValue, type CurrencyValue, currencyForCountry } from '@resto/domain';
import type { Sql } from 'postgres';
import { ApiClient } from '../lib/api-client';
import { createAuthDb, findMemberId, findUserIdByEmail, insertStaffMember } from '../lib/auth-db';
import { printDemoCredentialsBlock } from '../lib/credentials-block';
import { log } from '../lib/logger';
import type { RuntimeOptions } from '../lib/options';
import { OperatorHttpClient, signInAsOperator } from '../lib/operator-http';
import { createAppDb, seedDemoOrder, DEMO_ORDER_SPECS } from '../lib/demo-orders';
import { uploadPhotoFromUrl } from '../lib/photo-upload';
import {
  assertPaymentsReadyAllowed,
  markTenantPaymentsReady,
  requireStripeTestAccountId,
} from '../lib/payments-ready';

const DEMO_PASSWORD = 'DevPassword123!';
const ADMIN_URL = 'http://localhost:4000';

interface TenantResponse {
  readonly id: string;
  readonly slug: string;
}

interface BootstrapOwnerResponse {
  readonly userId: string;
}

interface LocationResponse {
  readonly id: string;
  readonly name: string;
}

interface CategoryListItem {
  readonly id: string;
  readonly slug: string;
}

interface CategoryListResponse {
  readonly items: readonly CategoryListItem[];
}

interface ItemListItem {
  readonly id: string;
  readonly slug: string;
  readonly photo: { readonly s3Key: string; readonly sortOrder: number } | null;
}

interface ItemListResponse {
  readonly items: readonly ItemListItem[];
}

interface ItemDetailResponse {
  readonly id: string;
  readonly sizes: readonly { readonly id: string; readonly name: Localized }[];
}

interface TenantDef {
  readonly slug: string;
  readonly displayName: string;
  readonly country: CountryCodeValue;
  readonly locations: readonly string[];
}

/**
 * The one tenant `--payments-ready` (10.2 plan 18 Task 3) makes able
 * to accept a real test payment. Deliberately not all three — a demo where
 * every restaurant is payment-ready hides the `payments.not_enabled` path,
 * which is real behaviour worth being able to see. `pizza` already gets
 * demo orders below (`index === 0`), so it is also the tenant with
 * something to actually check out.
 */
const PAYMENTS_READY_TENANT_SLUG = 'pizza';

// D-33/D-34/D-35: one entry per market so the fixture exercises all three
// supported countries and their derived currencies, not a single happy path.
const TENANTS: readonly TenantDef[] = [
  {
    slug: 'pizza',
    displayName: 'Pizza Palace',
    country: 'UA',
    locations: ['Kyiv Center', 'Kyiv Left Bank'],
  },
  { slug: 'burger', displayName: 'Burger Barn', country: 'GB', locations: ['Central', 'Mall'] },
  { slug: 'tapas', displayName: 'Tapas Bar', country: 'ES', locations: ['Madrid Centro'] },
];

type Localized = Readonly<Record<string, string>>;

interface SizeDef {
  readonly name: Localized;
  readonly price: string;
  readonly isDefault?: boolean;
}

interface ItemDef {
  readonly slug: string;
  readonly name: Localized;
  readonly description?: Localized;
  readonly price: string;
  /** Public photo pulled into our own S3 on first seed — see PIZZA_PHOTO. */
  readonly photoUrl?: string;
  readonly sizes?: readonly SizeDef[];
}

interface CategoryDef {
  readonly slug: string;
  readonly name: Localized;
  readonly items: readonly ItemDef[];
}

/**
 * Dodo Pizza's own product photography, pulled from their public CDN so the
 * demo pizzeria looks like a real menu instead of a grid of grey boxes.
 * Development fixture only — these images are Dodo's, not ours, and must not
 * ship in a public demo or in production seed data.
 */
const PIZZA_PHOTO = (id: string): string =>
  `https://cdn.dodostatic.net/static/Img/Products/Pizza/ru-RU/${id}.jpg`;

/** Dodo's current CDN, which serves the product shot already cut out (WebP with
 * alpha). Preferred over PIZZA_PHOTO: nothing has to be removed, so the edge is
 * theirs rather than our flood fill's. */
const PIZZA_PHOTO_CUTOUT = (id: string): string =>
  `https://media.dodostatic.net/image/r:1875x1875/${id}.webp`;

const PIZZA_SIZES = (small: string, medium: string, large: string): readonly SizeDef[] => [
  { name: { en: '25 cm', uk: '25 см', ru: '25 см' }, price: small, isDefault: true },
  { name: { en: '30 cm', uk: '30 см', ru: '30 см' }, price: medium },
  { name: { en: '35 cm', uk: '35 см', ru: '35 см' }, price: large },
];

const CATALOG: Readonly<Record<string, readonly CategoryDef[]>> = {
  pizza: [
    {
      slug: 'pizzas',
      name: { en: 'Pizzas', uk: 'Піци', ru: 'Пиццы' },
      items: [
        {
          slug: 'margherita',
          name: { en: 'Margherita', uk: 'Маргарита', ru: 'Маргарита' },
          description: {
            en: 'Tomatoes, mozzarella, Italian herbs, tomato sauce',
            uk: 'Томати, моцарела, італійські трави, томатний соус',
            ru: 'Томаты, моцарелла, итальянские травы, томатный соус',
          },
          price: '189.00',
          photoUrl: PIZZA_PHOTO('d48003cd-902c-420d-9f28-92d9dc5f73b4'),
          sizes: PIZZA_SIZES('189.00', '249.00', '309.00'),
        },
        {
          slug: 'pepperoni',
          name: { en: 'Pepperoni', uk: 'Пепероні', ru: 'Пепперони' },
          description: {
            en: 'Spicy pepperoni, mozzarella, tomato sauce',
            uk: 'Пікантна пепероні, моцарела, томатний соус',
            ru: 'Пикантная пепперони, моцарелла, томатный соус',
          },
          price: '239.00',
          photoUrl: PIZZA_PHOTO('d2e337e9-e07a-4199-9cc1-501cc44cb8f8'),
          sizes: PIZZA_SIZES('239.00', '309.00', '379.00'),
        },
        {
          slug: 'four-cheese',
          name: { en: 'Four Cheese', uk: 'Сирна', ru: 'Сырная' },
          description: {
            en: 'Mozzarella, cheddar, parmesan, cream sauce',
            uk: 'Моцарела, чедер, пармезан, вершковий соус',
            ru: 'Моцарелла, чеддер, пармезан, сливочный соус',
          },
          price: '219.00',
          photoUrl: PIZZA_PHOTO('2ffc31bb-132c-4c99-b894-53f7107a1441'),
          sizes: PIZZA_SIZES('219.00', '289.00', '349.00'),
        },
        {
          slug: 'bbq-chicken',
          name: { en: 'BBQ Chicken', uk: 'Курча барбекю', ru: 'Цыплёнок барбекю' },
          description: {
            en: 'Chicken, BBQ sauce, bacon, sweet pepper, pickles, red onion, mozzarella',
            uk: 'Курка, соус барбекю, бекон, солодкий перець, огірочки, червона цибуля, моцарела',
            ru: 'Курица, соус барбекю, бекон, сладкий перец, огурчики, красный лук, моцарелла',
          },
          price: '249.00',
          photoUrl: PIZZA_PHOTO('6652fec1-04df-49d8-8744-232f1032c44b'),
          sizes: PIZZA_SIZES('249.00', '319.00', '389.00'),
        },
        {
          slug: 'sweet-and-sour-chicken',
          name: {
            en: 'Sweet and Sour Chicken',
            uk: 'Кисло-солодке курча',
            ru: 'Кисло-сладкий цыплёнок',
          },
          description: {
            en: 'Chicken, pineapple, sweet pepper, sweet and sour sauce, mozzarella',
            uk: 'Курка, ананаси, солодкий перець, кисло-солодкий соус, моцарела',
            ru: 'Курица, ананасы, сладкий перец, кисло-сладкий соус, моцарелла',
          },
          price: '239.00',
          photoUrl: PIZZA_PHOTO('af553bf5-3887-4501-b88e-8f0f55229429'),
          sizes: PIZZA_SIZES('239.00', '309.00', '379.00'),
        },
        {
          slug: 'cheeseburger-pizza',
          name: { en: 'Cheeseburger Pizza', uk: 'Чізбургер-піца', ru: 'Чизбургер-пицца' },
          description: {
            en: 'Beef, pickles, tomatoes, red onion, burger sauce, mozzarella',
            uk: 'Яловичина, огірочки, томати, червона цибуля, соус бургер, моцарела',
            ru: 'Говядина, огурчики, томаты, красный лук, соус бургер, моцарелла',
          },
          price: '259.00',
          photoUrl: PIZZA_PHOTO('b750f576-4a83-48e6-a283-5a8efb68c35d'),
          sizes: PIZZA_SIZES('259.00', '329.00', '399.00'),
        },
        {
          slug: 'crazy-pepperoni',
          name: { en: 'Crazy Pepperoni', uk: 'Крейзі пепероні', ru: 'Крейзи пепперони' },
          description: {
            en: 'Double pepperoni, jalapeño, mozzarella, tomato sauce',
            uk: 'Подвійна пепероні, халапеньо, моцарела, томатний соус',
            ru: 'Двойная пепперони, халапеньо, моцарелла, томатный соус',
          },
          price: '289.00',
          photoUrl: PIZZA_PHOTO('1e1a6e80-b3ba-4a44-b6b9-beae5b1fbf27'),
          sizes: PIZZA_SIZES('289.00', '359.00', '429.00'),
        },
        {
          slug: 'pepperoni-fresh',
          name: {
            en: 'Pepperoni Fresh with Pepper',
            uk: 'Пепероні фреш з перцем',
            ru: 'Пепперони фреш с перцем',
          },
          description: {
            en: 'Spicy pepperoni, sweet pepper, mozzarella, tomato sauce',
            uk: 'Пікантна пепероні, солодкий перець, моцарела, томатний соус',
            ru: 'Пикантная пепперони, сладкий перец, моцарелла, томатный соус',
          },
          price: '259.00',
          photoUrl:
            'https://cdn.dodostatic.net/static/Img/Products/f035c7f46c0844069722f2bb3ee9f113_584x584.jpeg',
          sizes: PIZZA_SIZES('259.00', '329.00', '399.00'),
        },
        {
          slug: 'four-seasons',
          name: { en: 'Four Seasons', uk: 'Чотири сезони', ru: 'Четыре сезона' },
          description: {
            en: 'Pepperoni, ham, mushrooms, tomatoes, mozzarella, tomato sauce',
            uk: 'Пепероні, шинка, печериці, томати, моцарела, томатний соус',
            ru: 'Пепперони, ветчина, шампиньоны, томаты, моцарелла, томатный соус',
          },
          price: '269.00',
          photoUrl: PIZZA_PHOTO('ec29465e-606b-4a04-a03e-da3940d37e0e'),
          sizes: PIZZA_SIZES('269.00', '339.00', '409.00'),
        },
        {
          slug: 'ham-and-cheese',
          name: { en: 'Ham and Cheese', uk: 'Шинка та сир', ru: 'Ветчина и сыр' },
          description: {
            en: 'Ham, mozzarella, Italian herbs, cream sauce',
            uk: 'Шинка, моцарела, італійські трави, вершковий соус',
            ru: 'Ветчина, моцарелла, итальянские травы, сливочный соус',
          },
          price: '229.00',
          photoUrl: PIZZA_PHOTO_CUTOUT('019a777f32cc764b976b3e4a7dd599ea'),
          sizes: PIZZA_SIZES('229.00', '299.00', '369.00'),
        },
        {
          slug: 'veggie-and-mushrooms',
          name: { en: 'Veggie and Mushrooms', uk: 'Овочі та гриби', ru: 'Овощи и грибы' },
          description: {
            en: 'Mushrooms, sweet pepper, tomatoes, red onion, mozzarella, tomato sauce',
            uk: 'Печериці, солодкий перець, томати, червона цибуля, моцарела, томатний соус',
            ru: 'Шампиньоны, сладкий перец, томаты, красный лук, моцарелла, томатный соус',
          },
          price: '219.00',
          photoUrl: PIZZA_PHOTO('30367198-f3bd-44ed-9314-6f717960da07'),
          sizes: PIZZA_SIZES('219.00', '289.00', '349.00'),
        },
      ],
    },
    {
      slug: 'drinks',
      name: { en: 'Drinks', uk: 'Напої', ru: 'Напитки' },
      items: [
        {
          slug: 'cola',
          name: { en: 'Cola 0.5 l', uk: 'Кола 0,5 л', ru: 'Кола 0,5 л' },
          price: '45.00',
        },
        {
          slug: 'orange-juice',
          name: {
            en: 'Orange juice 0.3 l',
            uk: 'Сік апельсиновий 0,3 л',
            ru: 'Сок апельсиновый 0,3 л',
          },
          price: '55.00',
        },
        {
          slug: 'water',
          name: {
            en: 'Still water 0.5 l',
            uk: 'Вода негазована 0,5 л',
            ru: 'Вода негазированная 0,5 л',
          },
          price: '30.00',
        },
      ],
    },
  ],
  burger: [
    {
      slug: 'burgers',
      name: { en: 'Burgers' },
      items: [
        { slug: 'cheeseburger', name: { en: 'Cheeseburger' }, price: '8.99' },
        { slug: 'veggie-burger', name: { en: 'Veggie Burger' }, price: '8.49' },
      ],
    },
    {
      slug: 'sides',
      name: { en: 'Sides' },
      items: [
        { slug: 'fries', name: { en: 'Fries' }, price: '3.99' },
        { slug: 'onion-rings', name: { en: 'Onion Rings' }, price: '4.49' },
      ],
    },
  ],
  tapas: [
    {
      slug: 'tapas',
      name: { en: 'Tapas' },
      items: [
        { slug: 'patatas-bravas', name: { en: 'Patatas Bravas' }, price: '5.50' },
        { slug: 'gambas-al-ajillo', name: { en: 'Gambas al Ajillo' }, price: '8.50' },
      ],
    },
    {
      slug: 'drinks',
      name: { en: 'Drinks' },
      items: [
        { slug: 'sangria', name: { en: 'Sangria' }, price: '4.50' },
        { slug: 'agua', name: { en: 'Agua' }, price: '1.80' },
      ],
    },
  ],
};

interface StaffDef {
  readonly email: string;
  readonly name: string;
  readonly tenant: string;
  readonly roleSlug: string;
  readonly locations: readonly string[];
}

// D-17: staff belong to exactly one tenant — never several.
const STAFF: readonly StaffDef[] = [
  {
    email: 'manager@demo.local',
    name: 'Demo Manager',
    tenant: 'pizza',
    roleSlug: 'manager',
    locations: ['Kyiv Center', 'Kyiv Left Bank'],
  },
  {
    email: 'cashier@demo.local',
    name: 'Demo Cashier',
    tenant: 'burger',
    roleSlug: 'cashier-foh',
    locations: ['Central'],
  },
];

const requireEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`Required environment variable ${name} is not set.`);
  return value;
};

/**
 * Real coordinates, because the API now requires a point and inventing one puts a demo restaurant
 * in the sea. Each is the actual district the name refers to.
 */
const LOCATION_POINTS: Readonly<
  Record<string, { latitude: number; longitude: number; address: string }>
> = {
  'Kyiv Center': { latitude: 50.4501, longitude: 30.5234, address: 'Хрещатик 1, Київ' },
  'Kyiv Left Bank': {
    latitude: 50.4547,
    longitude: 30.6014,
    address: 'Броварський проспект 15, Київ',
  },
  Central: { latitude: 51.5074, longitude: -0.1278, address: '1 High Street, London' },
  Mall: { latitude: 51.5155, longitude: -0.1418, address: '10 Oxford Street, London' },
  'Madrid Centro': { latitude: 40.4168, longitude: -3.7038, address: 'Puerta del Sol 1, Madrid' },
};

const ensureLocations = async (
  op: OperatorHttpClient,
  tenantDef: TenantDef,
): Promise<Map<string, string>> => {
  const existing = await op.get<LocationResponse[]>('/v1/tenancy/locations');
  const byName = new Map(existing.map((l) => [l.name, l.id]));

  for (const name of tenantDef.locations) {
    if (byName.has(name)) {
      log('seed-demo.location.exists', { tenant: tenantDef.slug, name });
      continue;
    }
    const point = LOCATION_POINTS[name];
    if (!point) throw new Error(`seed-demo: no coordinates defined for location "${name}"`);
    const created = await op.post<LocationResponse>('/v1/tenancy/locations', {
      name,
      address: point.address,
      latitude: point.latitude,
      longitude: point.longitude,
      contacts: null,
    });
    byName.set(name, created.id);
    log('seed-demo.location.created', { tenant: tenantDef.slug, name, id: created.id });
  }
  return byName;
};

const ensureItemSizes = async (
  op: OperatorHttpClient,
  tenantSlug: string,
  menuItemId: string,
  item: ItemDef,
): Promise<void> => {
  if (!item.sizes || item.sizes.length === 0) return;

  const detail = await op.get<ItemDetailResponse>(`/v1/catalog/items/${menuItemId}`);
  const sizeIdByName = new Map(detail.sizes.map((size) => [size.name.en ?? '', size.id]));

  for (const [index, size] of item.sizes.entries()) {
    const existingId = sizeIdByName.get(size.name.en ?? '');
    await op.post('/v1/catalog/item-sizes', {
      ...(existingId ? { id: existingId } : {}),
      menuItemId,
      name: size.name,
      price: size.price,
      isDefault: size.isDefault ?? false,
      sortOrder: index,
    });
  }
  log('seed-demo.item.sizes', { tenant: tenantSlug, menuItemId, sizes: item.sizes.length });
};

const ensureCatalog = async (
  op: OperatorHttpClient,
  tenantSlug: string,
  currency: CurrencyValue,
  refreshPhotos: boolean,
): Promise<void> => {
  const existingCategories = await op.get<CategoryListResponse>('/v1/catalog/categories');
  const categoryBySlug = new Map(existingCategories.items.map((c) => [c.slug, c.id]));

  for (const [categoryIndex, category] of (CATALOG[tenantSlug] ?? []).entries()) {
    let categoryId = categoryBySlug.get(category.slug);
    if (categoryId) {
      log('seed-demo.category.exists', { tenant: tenantSlug, slug: category.slug });
    } else {
      const created = await op.post<{ id: string }>('/v1/catalog/categories', {
        slug: category.slug,
        name: category.name,
        parentId: null,
        description: null,
        sortOrder: categoryIndex,
        code: null,
      });
      categoryId = created.id;
      log('seed-demo.category.created', {
        tenant: tenantSlug,
        slug: category.slug,
        id: categoryId,
      });
    }

    const existingItems = await op.get<ItemListResponse>(
      `/v1/catalog/items?categoryId=${categoryId}&status=all`,
    );
    const itemBySlug = new Map(existingItems.items.map((i) => [i.slug, i]));

    for (const [itemIndex, item] of category.items.entries()) {
      const existing = itemBySlug.get(item.slug);
      const existingKey = existing?.photo?.s3Key ?? null;
      const s3Key =
        existingKey !== null && !refreshPhotos
          ? existingKey
          : item.photoUrl
            ? await uploadPhotoFromUrl(op, item.photoUrl)
            : existingKey;

      const payload = {
        ...(existing ? { id: existing.id } : {}),
        categoryId,
        slug: item.slug,
        name: item.name,
        description: item.description ?? null,
        basePrice: item.price,
        currency,
        photos: s3Key ? [{ s3Key, sortOrder: 0, isPrimary: true }] : [],
        sortOrder: itemIndex,
        status: 'published' as const,
      };
      const saved = await op.post<{ id: string }>('/v1/catalog/items', payload);
      log(existing ? 'seed-demo.item.updated' : 'seed-demo.item.created', {
        tenant: tenantSlug,
        slug: item.slug,
      });

      await ensureItemSizes(op, tenantSlug, saved.id, item);
    }
  }

  await op.post('/v1/catalog/publish', {}).catch((err: unknown) => {
    log('seed-demo.publish.skipped', { tenant: tenantSlug, err: String(err) });
  });
};

/**
 * Creates (or reuses) the BA user + `member` row for a staff fixture.
 *
 * `/api/auth/sign-up/email` is closed to external callers without a
 * pending invitation (D-29, 10.2 plan 13) — the seed's real HTTP call
 * would now 403. `/internal/v1/tenants/:id/owner` is the one remaining
 * internal-token-gated path that creates a BA account without that gate,
 * but it always grants `role: 'owner'`. Safe here only because staff are
 * bootstrapped before the real owner for the same tenant (see
 * `runSeedDemo`), so the tenant has no owner-role member yet; the role is
 * downgraded to 'staff' immediately after.
 */
const ensureStaffAccount = async (
  api: ApiClient,
  authDb: Sql,
  tenant: TenantResponse,
  staff: StaffDef,
): Promise<string> => {
  let userId = await findUserIdByEmail(authDb, staff.email);
  if (userId) {
    log('seed-demo.staff.user_exists', { email: staff.email });
  } else {
    const created = await api.post<BootstrapOwnerResponse>(
      `/internal/v1/tenants/${tenant.id}/owner`,
      { email: staff.email, password: DEMO_PASSWORD, name: staff.name },
    );
    userId = created.userId;
    log('seed-demo.staff.user_created', { email: staff.email, userId });
  }

  let memberId = await findMemberId(authDb, tenant.id, userId);
  if (memberId) {
    await authDb`UPDATE member SET role = 'staff' WHERE id = ${memberId} AND role <> 'staff'`;
    log('seed-demo.staff.member_exists', { email: staff.email, memberId });
  } else {
    memberId = await insertStaffMember(authDb, tenant.id, userId);
    log('seed-demo.staff.member_created', { email: staff.email, memberId });
  }
  return memberId;
};

const seedDemoOrdersForTenant = async (
  op: OperatorHttpClient,
  apiUrl: string,
  tenant: TenantResponse,
  tenantDef: TenantDef,
  locationsByName: Map<string, string>,
): Promise<void> => {
  const locationName = tenantDef.locations[0];
  const locationId = locationName ? locationsByName.get(locationName) : undefined;
  if (!locationId) {
    log('seed-demo.orders.skipped', { reason: 'no location resolved', tenant: tenantDef.slug });
    return;
  }
  const items = await op.get<{ items: { id: string; slug: string }[] }>(
    '/v1/catalog/items?status=published',
  );
  const firstItem = items.items[0];
  if (!firstItem) {
    log('seed-demo.orders.skipped', {
      reason: 'no published catalog item',
      tenant: tenantDef.slug,
    });
    return;
  }
  const appDb = createAppDb(requireEnv('DATABASE_URL'));
  try {
    for (const spec of DEMO_ORDER_SPECS) {
      const seeded = await seedDemoOrder(appDb, {
        apiUrl,
        tenantId: tenant.id,
        locationId,
        itemId: firstItem.id,
        itemName: firstItem.slug,
        spec,
      });
      log('seed-demo.order.seeded', {
        tenant: tenantDef.slug,
        location: locationName,
        shortNumber: seeded.shortNumber,
        status: seeded.status,
      });
    }
  } finally {
    await appDb.end({ timeout: 5 });
  }
};

export const runSeedDemo = async (
  argv: readonly string[],
  options: RuntimeOptions,
): Promise<void> => {
  if (process.env.NODE_ENV !== 'development') {
    throw new Error(
      'seed-demo only runs with NODE_ENV=development (dev fixture, not for real envs).',
    );
  }
  const authDatabaseUrl = requireEnv('BETTER_AUTH_DATABASE_URL');

  // 10.2 plan 18 Task 3, Option A: gated behind an explicit flag, refused
  // outside development/test even though the check above already narrows
  // to development — this guard is the one that stays correct if
  // markTenantPaymentsReady is ever called from a path with a looser
  // outer guard (mirrors how assertProdGuardrails mirrors env.schema.ts).
  const paymentsReadyRequested = argv.includes('--payments-ready');
  // Photos are reused across runs; this re-pulls and re-cuts them after a change
  // to the source list or to the image pipeline.
  const refreshPhotos = argv.includes('--refresh-photos');
  if (paymentsReadyRequested) {
    assertPaymentsReadyAllowed(process.env.NODE_ENV);
  }

  if (options.dryRun) {
    log('seed-demo.plan', {
      owner: 'owner@demo.local',
      tenants: TENANTS.map((t) => ({ slug: t.slug, country: t.country })),
      staff: STAFF.map((s) => s.email),
      paymentsReady: paymentsReadyRequested ? PAYMENTS_READY_TENANT_SLUG : null,
    });
    return;
  }

  // Fail fast, before any provisioning call, if the flag is set but the
  // real account id isn't available — never partially seed.
  const stripeAccountId = paymentsReadyRequested
    ? requireStripeTestAccountId(process.env)
    : undefined;

  const api = new ApiClient({ apiUrl: options.apiUrl, internalToken: options.internalToken });
  const authDb = createAuthDb(authDatabaseUrl);

  try {
    for (const [index, tenantDef] of TENANTS.entries()) {
      const tenant = await api.post<TenantResponse>('/internal/v1/tenants', {
        slug: tenantDef.slug,
        displayName: tenantDef.displayName,
        country: tenantDef.country,
      });
      log('seed-demo.tenant.ready', {
        id: tenant.id,
        slug: tenant.slug,
        country: tenantDef.country,
      });

      const staffForTenant = STAFF.filter((s) => s.tenant === tenantDef.slug);
      const memberIdByEmail = new Map<string, string>();
      for (const staff of staffForTenant) {
        memberIdByEmail.set(staff.email, await ensureStaffAccount(api, authDb, tenant, staff));
      }

      await api.post<BootstrapOwnerResponse>(`/internal/v1/tenants/${tenant.id}/owner`, {
        email: 'owner@demo.local',
        password: DEMO_PASSWORD,
        name: 'Demo Owner',
      });
      log('seed-demo.owner.ready', { email: 'owner@demo.local', tenant: tenantDef.slug });

      const ownerCookie = await signInAsOperator(
        options.apiUrl,
        'owner@demo.local',
        DEMO_PASSWORD,
        tenant.id,
      );
      const op = new OperatorHttpClient(options.apiUrl, ownerCookie, {
        'x-tenant-slug': tenant.slug,
      });

      const locationsByName = await ensureLocations(op, tenantDef);
      await ensureCatalog(op, tenantDef.slug, currencyForCountry(tenantDef.country), refreshPhotos);

      for (const staff of staffForTenant) {
        const memberId = memberIdByEmail.get(staff.email);
        if (!memberId) throw new Error(`Missing memberId for ${staff.email}`);
        for (const locationName of staff.locations) {
          const locationId = locationsByName.get(locationName);
          if (!locationId) {
            throw new Error(
              `Location "${locationName}" for tenant "${tenantDef.slug}" was not provisioned.`,
            );
          }
          await op.post(`/v1/members/${memberId}/location-roles`, {
            locationId,
            roleSlug: staff.roleSlug,
          });
          log('seed-demo.staff.location_role_assigned', {
            email: staff.email,
            tenant: tenantDef.slug,
            location: locationName,
            role: staff.roleSlug,
          });
        }
      }

      if (index === 0) {
        await seedDemoOrdersForTenant(op, options.apiUrl, tenant, tenantDef, locationsByName);
      }

      if (paymentsReadyRequested && tenantDef.slug === PAYMENTS_READY_TENANT_SLUG) {
        if (stripeAccountId === undefined) {
          throw new Error(
            'Unreachable: --payments-ready requested but no account id was resolved before provisioning started.',
          );
        }
        const appDb = createAppDb(requireEnv('DATABASE_URL'));
        try {
          await markTenantPaymentsReady(appDb, tenant.id, stripeAccountId);
          log('seed-demo.payments_ready', {
            tenant: tenantDef.slug,
            tenantId: tenant.id,
            stripeAccountId,
          });
        } finally {
          await appDb.end({ timeout: 5 });
        }
      }
    }
  } finally {
    await authDb.end({ timeout: 5 });
  }

  printDemoCredentialsBlock(ADMIN_URL, [
    {
      role: 'owner',
      email: 'owner@demo.local',
      password: DEMO_PASSWORD,
      scope: `all tenants (${TENANTS.map((t) => `${t.slug} [${t.country}]`).join(', ')}), all locations`,
    },
    {
      role: 'manager (pizza)',
      email: 'manager@demo.local',
      password: DEMO_PASSWORD,
      scope: 'tenant pizza — locations Kyiv Center + Kyiv Left Bank',
      note: 'scoped to 2 locations — expect the pick-location interstitial after login',
    },
    {
      role: 'cashier-foh (burger)',
      email: 'cashier@demo.local',
      password: DEMO_PASSWORD,
      scope: 'tenant burger — location Central',
      note: 'scoped to 1 location — auto-pinned, no interstitial',
    },
  ]);

  if (paymentsReadyRequested) {
    log('seed-demo.payments_ready.summary', {
      tenant: PAYMENTS_READY_TENANT_SLUG,
      note: 'guest checkout for this tenant now uses a real Stripe test-mode PaymentIntent — the other two tenants are left without payments (payments.not_enabled by design)',
    });
  }
};
