import type { IncomingHttpHeaders } from 'node:http';

/**
 * The guest's claim to a table, opened by scanning its code. Not a context cookie in the sense
 * D-03 retired: the tenant and the location still come from the host and the table row — this
 * carries only which table the browser sat down at, and the server re-resolves it every time.
 */
export const TABLE_SESSION_COOKIE = 'resto.table';

const COOKIE_VALUE = /^[A-Za-z0-9-]{8,128}$/;

export const readTableSessionCookie = (headers: IncomingHttpHeaders): string | undefined => {
  const header = headers.cookie;
  if (header === undefined) return undefined;
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name !== TABLE_SESSION_COOKIE) continue;
    const value = rest.join('=');
    return COOKIE_VALUE.test(value) ? value : undefined;
  }
  return undefined;
};

export const buildTableSessionCookie = (
  sessionId: string,
  options: { readonly secure: boolean; readonly maxAgeSeconds: number },
): string =>
  [
    `${TABLE_SESSION_COOKIE}=${sessionId}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${String(options.maxAgeSeconds)}`,
    ...(options.secure ? ['Secure'] : []),
  ].join('; ');
