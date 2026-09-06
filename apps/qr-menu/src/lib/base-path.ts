/** Read at module-eval time from Vite's `base` config; `/qr/` in production, `/` in dev/test. */
export const BASE_PATH = import.meta.env.BASE_URL.replace(/\/+$/, '');
