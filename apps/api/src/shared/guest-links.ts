import type { Env } from '../config/env.schema';

/**
 * The `/qr` base is a property of the qr-menu bundle (07.5-12), not of the hostname — written
 * down exactly once here so the sticker and the Worker route can never drift apart.
 */
export const GUEST_MENU_BASE_PATH = '/qr';
export const GUEST_ORDER_STATUS_PATH = '/checkout/confirmation';

/**
 * The one place a guest-facing host is composed from a tenant (07.5-13, guest mirror of
 * `admin-links.ts`): a primary verified custom domain outranks the apex, and the apex formula is
 * `<slug>.<PUBLIC_APEX_DOMAIN>`. Throws rather than falling back — a sticker, a stored primary
 * domain, or an emailed link built on a broken host is worse than one that failed to build at all.
 */
export const guestHostForTenant = (
  env: Pick<Env, 'PUBLIC_APEX_DOMAIN'>,
  tenant: { readonly slug: string },
  primaryVerifiedCustomDomain: string | null,
): string => {
  if (primaryVerifiedCustomDomain) return primaryVerifiedCustomDomain;

  const apex = env.PUBLIC_APEX_DOMAIN;
  if (!apex) {
    throw new Error(
      `Cannot build a guest host for tenant "${tenant.slug}": PUBLIC_APEX_DOMAIN is not set ` +
        'and the tenant has no primary verified custom domain.',
    );
  }
  return `${tenant.slug}.${apex}`;
};

export const guestMenuStickerUrl = (host: string, qrToken: string): string =>
  `https://${host}${GUEST_MENU_BASE_PATH}/t/${qrToken}`;

export const guestOrderStatusUrl = (host: string, orderId: string): string =>
  `https://${host}${GUEST_ORDER_STATUS_PATH}/${orderId}`;
