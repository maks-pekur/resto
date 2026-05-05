import 'server-only';
import { cookies } from 'next/headers';

/**
 * Server-side fetch wrapper for the api.
 *
 * - Reads the BA session cookie from the current request (`next/headers`)
 *   and forwards it to the api so identity-aware endpoints work.
 * - Sends `Origin: ${ADMIN_WEB_URL}` so BA's trusted-origin guard passes.
 *   The api adds this URL to BA's `trustedOrigins` (see RES-113).
 * - Parses `Set-Cookie` from the api response and re-sets the cookie on
 *   the user-facing response via `cookies().set(...)` — preserves
 *   `HttpOnly`, `SameSite`, `Path`, `Max-Age`, etc.
 *
 * This module MUST stay server-only (`server-only` import) so it never
 * leaks to the client bundle. Server actions, RSC, and route handlers
 * are the only legitimate callers.
 */

const apiOrigin = (): string => process.env.NEXT_PUBLIC_API_ORIGIN ?? 'http://localhost:3000';

const adminOrigin = (): string => process.env.ADMIN_WEB_URL ?? 'http://localhost:3001';

interface RequestOptions {
  readonly method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  readonly body?: unknown;
  readonly forwardSetCookie?: boolean;
  readonly headers?: Record<string, string>;
}

export interface ApiResponse<T> {
  readonly status: number;
  readonly ok: boolean;
  readonly data: T | null;
  readonly raw: Response;
}

interface ParsedSetCookie {
  readonly name: string;
  readonly value: string;
  readonly options: {
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: 'lax' | 'strict' | 'none';
    path?: string;
    domain?: string;
    maxAge?: number;
    expires?: Date;
  };
}

const parseSetCookie = (header: string): ParsedSetCookie => {
  const segments = header.split(';').map((s) => s.trim());
  const first = segments[0] ?? '';
  const eq = first.indexOf('=');
  const name = eq >= 0 ? first.slice(0, eq) : first;
  const value = eq >= 0 ? first.slice(eq + 1) : '';
  const options: ParsedSetCookie['options'] = {};
  for (const seg of segments.slice(1)) {
    const [k, v] = seg.split('=');
    if (!k) continue;
    const key = k.toLowerCase();
    if (key === 'httponly') options.httpOnly = true;
    else if (key === 'secure') options.secure = true;
    else if (key === 'samesite' && v) {
      const lower = v.toLowerCase();
      if (lower === 'lax' || lower === 'strict' || lower === 'none') options.sameSite = lower;
    } else if (key === 'path' && v) options.path = v;
    else if (key === 'domain' && v) options.domain = v;
    else if (key === 'max-age' && v) options.maxAge = Number.parseInt(v, 10);
    else if (key === 'expires' && v) options.expires = new Date(v);
  }
  return { name, value, options };
};

const collectSetCookies = (res: Response): readonly string[] => {
  // `Headers.getSetCookie()` is the modern API (Node 20+, undici 6+); fall
  // back to the legacy `get('set-cookie')` for older envs / mocks.
  const getter = (res.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  if (typeof getter === 'function') return getter.call(res.headers);
  const single = res.headers.get('set-cookie');
  return single ? [single] : [];
};

/**
 * Make a server-side fetch to the api with cookie forwarding.
 *
 * `forwardSetCookie` controls whether `Set-Cookie` from the api response
 * is relayed to the user's browser. Auth flows (sign-in, sign-out,
 * organization/set-active) need this; plain reads (`/v1/tenants/me`)
 * do not.
 */
export const apiFetch = async <T>(
  path: string,
  options: RequestOptions = {},
): Promise<ApiResponse<T>> => {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');

  const url = `${apiOrigin()}${path.startsWith('/') ? '' : '/'}${path}`;
  const headers: Record<string, string> = {
    accept: 'application/json',
    origin: adminOrigin(),
    ...(cookieHeader ? { cookie: cookieHeader } : {}),
    ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
    ...options.headers,
  };
  const res = await fetch(url, {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    cache: 'no-store',
    redirect: 'manual',
  });

  if (options.forwardSetCookie === true) {
    const incoming = collectSetCookies(res);
    for (const sc of incoming) {
      const parsed = parseSetCookie(sc);
      cookieStore.set({ name: parsed.name, value: parsed.value, ...parsed.options });
    }
  }

  let data: T | null = null;
  const ct = res.headers.get('content-type') ?? '';
  if (ct.includes('application/json') || ct.includes('application/problem+json')) {
    try {
      data = (await res.json()) as T;
    } catch {
      data = null;
    }
  }
  return { status: res.status, ok: res.ok, data, raw: res };
};
