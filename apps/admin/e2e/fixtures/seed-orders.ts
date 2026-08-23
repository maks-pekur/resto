import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const POSTGRES_CONTAINER = process.env.ADMIN_E2E_POSTGRES_CONTAINER ?? 'resto-postgres';
const POSTGRES_USER = process.env.ADMIN_E2E_POSTGRES_USER ?? 'resto';
const POSTGRES_DB = process.env.ADMIN_E2E_POSTGRES_DB ?? 'resto';
const STRIPE_ACCOUNT_ID = 'acct_e2ePhase1013Fixture';

const q = (value: string): string => `'${value.replace(/'/g, "''")}'`;

const runSql = async (sql: string): Promise<void> => {
  try {
    await execFileAsync('docker', [
      'exec',
      POSTGRES_CONTAINER,
      'psql',
      '-U',
      POSTGRES_USER,
      '-d',
      POSTGRES_DB,
      '-v',
      'ON_ERROR_STOP=1',
      '-q',
      '-c',
      sql,
    ]);
  } catch (err) {
    const cause = err as { stdout?: string; stderr?: string; message?: string };
    throw new Error(
      `runSql failed: ${cause.message ?? 'unknown'}\n${cause.stdout ?? ''}\n${cause.stderr ?? ''}`,
    );
  }
};

export interface SeededOrder {
  readonly id: string;
  readonly shortNumber: number;
  readonly orderNumber: string;
  readonly locationId: string;
  readonly total: string;
  readonly currency: string;
}

interface CreateOrderResponse {
  readonly orderId: string;
  readonly orderNumber: string;
  readonly status: string;
  readonly total: string;
  readonly currency: string;
  readonly shortNumber: number;
  readonly channel: string;
}

export interface CreateOrderViaCheckoutInput {
  readonly apiOrigin: string;
  readonly tenantId: string;
  readonly brandSlug: string;
  readonly itemId: string;
  readonly locationId: string;
  readonly quantity?: number;
  readonly fulfillmentMode?: 'dine_in' | 'pickup' | 'delivery';
  readonly table?: string;
  readonly customerName?: string;
  readonly customerPhone?: string;
  readonly customerEmail?: string;
  readonly channel?: 'site' | 'qr-menu';
  readonly marketingConsent?: boolean;
}

const createOrderViaCheckout = async (
  input: CreateOrderViaCheckoutInput,
): Promise<CreateOrderResponse> => {
  const fulfillmentMode = input.fulfillmentMode ?? 'dine_in';
  const body: Record<string, unknown> = {
    items: [
      {
        itemId: input.itemId,
        sizeId: null,
        name: 'E2E Item',
        modifiers: [],
        quantity: input.quantity ?? 1,
      },
    ],
    fulfillmentMode,
    idempotencyKey: randomUUID(),
    channel: input.channel ?? 'site',
    marketingConsent: input.marketingConsent ?? false,
  };
  if (fulfillmentMode === 'dine_in') {
    body.table = input.table ?? 'T1';
  } else {
    body.customerName = input.customerName ?? 'E2E Guest';
    body.customerPhone = input.customerPhone ?? '+15550000000';
  }
  if (input.customerEmail !== undefined) body.customerEmail = input.customerEmail;

  const res = await fetch(`${input.apiOrigin}/v1/orders`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-tenant-id': input.tenantId,
      'x-brand-slug': input.brandSlug,
    },
    body: JSON.stringify(body),
  });
  if (res.status !== 201) {
    throw new Error(`createOrderViaCheckout -> ${String(res.status)} ${await res.text()}`);
  }
  return (await res.json()) as CreateOrderResponse;
};

const capturePaymentDirect = async (input: {
  tenantId: string;
  orderId: string;
  amount: string;
  currency: string;
}): Promise<void> => {
  const paymentId = randomUUID();
  const paymentIntentId = `pi_e2e${randomUUID().replace(/-/g, '').slice(0, 20)}`;
  const chargeId = `ch_e2e${randomUUID().replace(/-/g, '').slice(0, 20)}`;
  await runSql(
    `UPDATE orders SET status = 'paid', updated_at = now() WHERE id = ${q(input.orderId)};
     INSERT INTO payments (id, tenant_id, order_id, status, amount, currency, provider, payment_intent_id, latest_charge_id, refunded_amount, stripe_account_id, application_fee_amount)
     VALUES (${q(paymentId)}, ${q(input.tenantId)}, ${q(input.orderId)}, 'succeeded', ${q(input.amount)}, ${q(input.currency)}, 'stripe', ${q(paymentIntentId)}, ${q(chargeId)}, '0.00', ${q(STRIPE_ACCOUNT_ID)}, '0.00');`,
  );
};

export type SeedPaidOrderInput = CreateOrderViaCheckoutInput;

export const seedPaidOrder = async (input: SeedPaidOrderInput): Promise<SeededOrder> => {
  const created = await createOrderViaCheckout(input);
  await capturePaymentDirect({
    tenantId: input.tenantId,
    orderId: created.orderId,
    amount: created.total,
    currency: created.currency,
  });
  return {
    id: created.orderId,
    shortNumber: created.shortNumber,
    orderNumber: created.orderNumber,
    locationId: input.locationId,
    total: created.total,
    currency: created.currency,
  };
};

export interface SeedPaidOrderAtOtherLocationInput {
  readonly tenantId: string;
  readonly brandId: string;
  readonly locationId: string;
  readonly shortNumber: number;
  readonly amount: string;
  readonly currency: string;
  readonly fulfillmentMode?: 'dine_in' | 'pickup' | 'delivery';
}

export const seedPaidOrderAtOtherLocation = async (
  input: SeedPaidOrderAtOtherLocationInput,
): Promise<SeededOrder> => {
  const orderId = randomUUID();
  const orderNumber = `E2E-${orderId.slice(0, 8).toUpperCase()}`;
  const idempotencyKey = randomUUID();
  const fulfillmentMode = input.fulfillmentMode ?? 'dine_in';
  await runSql(
    `INSERT INTO orders (id, tenant_id, brand_id, location_id, idempotency_key, order_number, status, fulfillment_mode, table_identifier, subtotal, total, currency, short_number, channel, marketing_consent)
     VALUES (${q(orderId)}, ${q(input.tenantId)}, ${q(input.brandId)}, ${q(input.locationId)}, ${q(idempotencyKey)}, ${q(orderNumber)}, 'created', ${q(fulfillmentMode)}, 'T2', ${q(input.amount)}, ${q(input.amount)}, ${q(input.currency)}, ${String(input.shortNumber)}, 'site', false);`,
  );
  await capturePaymentDirect({
    tenantId: input.tenantId,
    orderId,
    amount: input.amount,
    currency: input.currency,
  });
  return {
    id: orderId,
    shortNumber: input.shortNumber,
    orderNumber,
    locationId: input.locationId,
    total: input.amount,
    currency: input.currency,
  };
};

export interface BootstrapStaffMemberInput {
  readonly apiOrigin: string;
  readonly originHeader: string;
  readonly tenantId: string;
  readonly email: string;
  readonly password: string;
  readonly name: string;
}

const extractCookiePairs = (setCookieHeader: string | null): string => {
  if (!setCookieHeader) return '';
  return setCookieHeader
    .split(',')
    .map((c) => c.split(';')[0]?.trim() ?? '')
    .filter(Boolean)
    .join('; ');
};

export interface BootstrapStaffSignUpResult {
  readonly memberId: string;
  readonly preActivationCookie: string;
}

export const bootstrapStaffMember = async (
  input: BootstrapStaffMemberInput,
): Promise<BootstrapStaffSignUpResult> => {
  const res = await fetch(`${input.apiOrigin}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: input.originHeader },
    body: JSON.stringify({ email: input.email, password: input.password, name: input.name }),
  });
  if (!res.ok) {
    throw new Error(`bootstrapStaffMember sign-up -> ${String(res.status)} ${await res.text()}`);
  }
  const body = (await res.json()) as { user: { id: string } };
  const memberId = randomUUID();
  await runSql(
    `INSERT INTO member (id, organization_id, user_id, role, created_at) VALUES (${q(memberId)}, ${q(input.tenantId)}, ${q(body.user.id)}, 'staff', now());`,
  );
  const preActivationCookie = extractCookiePairs(res.headers.get('set-cookie'));
  return { memberId, preActivationCookie };
};

export interface ActivateStaffOrgInput {
  readonly apiOrigin: string;
  readonly originHeader: string;
  readonly tenantId: string;
  readonly preActivationCookie: string;
}

export const activateStaffOrg = async (input: ActivateStaffOrgInput): Promise<string> => {
  const setActiveRes = await fetch(`${input.apiOrigin}/api/auth/organization/set-active`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: input.preActivationCookie,
      origin: input.originHeader,
    },
    body: JSON.stringify({ organizationId: input.tenantId }),
  });
  if (!setActiveRes.ok) {
    throw new Error(
      `activateStaffOrg set-active -> ${String(setActiveRes.status)} ${await setActiveRes.text()}`,
    );
  }
  return extractCookiePairs(setActiveRes.headers.get('set-cookie')) || input.preActivationCookie;
};
