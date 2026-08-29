export const MENU_CACHE_S_MAXAGE_SECONDS = 300;
export const MENU_CACHE_STALE_WHILE_REVALIDATE_SECONDS = 60;
export const MENU_AVAILABILITY_S_MAXAGE_SECONDS = 5;

/**
 * How long a signed photo URL stays valid.
 *
 * It must outlive the menu document that carries it by a wide margin. A cached
 * document can already be `s-maxage + stale-while-revalidate` old when it reaches
 * the guest, and the guest then reads the menu with that page open. Signing the
 * photos for the same window as the cache — which is what this used to do — makes
 * every photo on the page break at once a few minutes in.
 */
export const MENU_IMAGE_URL_TTL_SECONDS = 3600;

export const MENU_CACHE_CONTROL = `public, s-maxage=${MENU_CACHE_S_MAXAGE_SECONDS.toString()}, stale-while-revalidate=${MENU_CACHE_STALE_WHILE_REVALIDATE_SECONDS.toString()}`;

export const MENU_AVAILABILITY_CACHE_CONTROL = `public, s-maxage=${MENU_AVAILABILITY_S_MAXAGE_SECONDS.toString()}`;
