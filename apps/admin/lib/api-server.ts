import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { apiOrigin, adminOrigin } from './env';
import { readActiveBrand } from './active-brand-cookie';

const TIMEOUT_GET_MS = 10_000;
const TIMEOUT_MUTATION_MS = 30_000;
const RETRY_BACKOFF_MS = 500;

const isRetryableServerError = (status: number): boolean => status >= 500 && status <= 504;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * `fetch` wrapper enforcing apps/CLAUDE.md network rules:
 *  - `AbortSignal.timeout(timeoutMs)` on every server-side request.
 *  - One retry on idempotent GET 5xx (500-504), ~500ms backoff.
 *  - Mutations are NEVER retried.
 *
 * Caller decides idempotency via `isGet`. Returns the final `Response`
 * (success or last-attempt failure) and lets the caller interpret the
 * status. AbortError / network errors propagate to caller for uniform
 * `{ ok: false, status: 0 }` handling.
 */
const executeWithRetry = async (
  input: string,
  init: Omit<RequestInit, 'signal'>,
  opts: { readonly isGet: boolean; readonly timeoutMs: number },
): Promise<Response> => {
  const maxAttempts = opts.isGet ? 2 : 1;
  // First attempt is unconditional; loop body covers retries up to maxAttempts.
  // Final iteration always returns, so the loop never falls through.
  for (let attempt = 1; ; attempt += 1) {
    const res = await fetch(input, { ...init, signal: AbortSignal.timeout(opts.timeoutMs) });
    if (!opts.isGet || !isRetryableServerError(res.status) || attempt >= maxAttempts) {
      return res;
    }
    await sleep(RETRY_BACKOFF_MS);
  }
};

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
  const activeBrand = await readActiveBrand();
  // Resolve BA's active organization id (= tenant id) once per request
  // and forward as `x-tenant-id` so the api's `TenantContextMiddleware`
  // binds ALS for `@RequiresTenantContext` operator routes (RES-181).
  // Skipped when the call is itself BA's session lookup — would loop.
  const activeTenantId =
    path === '/api/auth/get-session' ? null : await getActiveTenantId(cookieHeader);

  const url = `${apiOrigin()}${path.startsWith('/') ? '' : '/'}${path}`;
  const method = options.method ?? 'GET';
  const isGet = method === 'GET';
  const headers: Record<string, string> = {
    accept: 'application/json',
    origin: adminOrigin(),
    ...(cookieHeader ? { cookie: cookieHeader } : {}),
    ...(activeTenantId ? { 'x-tenant-id': activeTenantId } : {}),
    ...(activeBrand ? { 'x-brand-slug': activeBrand } : {}),
    ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
    ...options.headers,
  };

  let res: Response;
  try {
    res = await executeWithRetry(
      url,
      {
        method,
        headers,
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        cache: 'no-store',
        redirect: 'manual',
      },
      { isGet, timeoutMs: isGet ? TIMEOUT_GET_MS : TIMEOUT_MUTATION_MS },
    );
  } catch (err) {
    // AbortError (timeout) and network errors collapse into the same
    // shape callers already handle for non-2xx responses. `status: 0` is
    // the conventional sentinel; the raw `Response` carries 599 because
    // the web `Response` constructor refuses status 0.
    if (err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError')) {
      return { status: 0, ok: false, data: null, raw: new Response(null, { status: 599 }) };
    }
    throw err;
  }

  // CONTEXT D-10: stale BA session → bounce to login with a notice
  // instead of rendering an empty dashboard. The session-lookup probe is
  // exempt (it is the redirect's own dependency).
  if (res.status === 401 && path !== '/api/auth/get-session') {
    redirect('/login?expired=1');
  }

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

/**
 * Read BA's `activeOrganizationId` from the current operator session
 * (RES-181). Memoized via React `cache()` so each render / server
 * action makes at most one BA round-trip even when multiple `apiFetch`
 * calls fire. Returns `null` for unauthenticated requests, sign-in /
 * signup paths, or when the session is loaded but no active org is
 * set — the api will surface the appropriate 401/403 from the route.
 */
const getActiveTenantId = cache(async (cookieHeader: string): Promise<string | null> => {
  if (!cookieHeader) return null;
  try {
    const res = await executeWithRetry(
      `${apiOrigin()}/api/auth/get-session`,
      {
        headers: { accept: 'application/json', cookie: cookieHeader, origin: adminOrigin() },
        cache: 'no-store',
        redirect: 'manual',
      },
      { isGet: true, timeoutMs: TIMEOUT_GET_MS },
    );
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') ?? '';
    if (!ct.includes('application/json')) return null;
    const body = (await res.json()) as {
      session?: { activeOrganizationId?: string | null };
    } | null;
    const id = body?.session?.activeOrganizationId;
    return typeof id === 'string' && id.length > 0 ? id : null;
  } catch {
    return null;
  }
});
