import { VITE_API_ORIGIN } from '../env';
import { authClient } from './auth-client';

const TIMEOUT_GET_MS = 10_000;
const TIMEOUT_MUTATION_MS = 30_000;
const RETRY_BACKOFF_MS = 500;
const SESSION_CACHE_MS = 2_000;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

interface ApiFetchResult<T> {
  status: number;
  ok: boolean;
  data: T | null;
}

interface SessionLookupResult {
  readonly data: { session?: { activeOrganizationId?: string } } | null;
}

let sessionCache: { readonly result: SessionLookupResult; readonly at: number } | null = null;
let sessionInFlight: Promise<SessionLookupResult> | null = null;

const getCachedSession = async (): Promise<SessionLookupResult> => {
  const now = Date.now();
  if (sessionCache && now - sessionCache.at < SESSION_CACHE_MS) {
    return sessionCache.result;
  }
  if (sessionInFlight) return sessionInFlight;
  sessionInFlight = (async () => {
    const session = (await authClient.getSession()) as SessionLookupResult;
    sessionCache = { result: session, at: Date.now() };
    return session;
  })();
  try {
    return await sessionInFlight;
  } finally {
    sessionInFlight = null;
  }
};

export const apiFetch = async <T>(
  path: string,
  opts: {
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    body?: unknown;
    // 'all' or a uuid; absent/'all' -> omit header. D-12: apiFetch is a dumb
    // passthrough — the caller (use-effective-location hook) resolves the
    // per-role value; no session read for location happens in here.
    locationId?: string;
    signal?: AbortSignal;
  } = {},
): Promise<ApiFetchResult<T>> => {
  const session = await getCachedSession();
  const sessionData = session.data !== null ? session.data.session : undefined;
  const tenantId = sessionData?.activeOrganizationId;
  const isGet = (opts.method ?? 'GET') === 'GET';
  const timeoutMs = isGet ? TIMEOUT_GET_MS : TIMEOUT_MUTATION_MS;
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const signal =
    opts.signal !== undefined ? AbortSignal.any([timeoutSignal, opts.signal]) : timeoutSignal;
  const headers: Record<string, string> = {
    accept: 'application/json',
    ...(tenantId !== undefined ? { 'x-tenant-id': tenantId } : {}),
    ...(opts.locationId !== undefined && opts.locationId !== 'all'
      ? { 'x-location-id': opts.locationId }
      : {}),
    ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}),
  };
  const maxAttempts = isGet ? 2 : 1;
  for (let attempt = 1; ; attempt += 1) {
    const res = await fetch(`${VITE_API_ORIGIN}${path}`, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      credentials: 'include',
      signal,
    });
    if (res.status === 401) {
      void authClient.signOut();
      window.location.href = '/login?expired=1';
      return { status: 401, ok: false, data: null };
    }
    if (!isGet || !(res.status >= 500 && res.status <= 504) || attempt >= maxAttempts) {
      let data: T | null = null;
      const ct = res.headers.get('content-type') ?? '';
      if (ct.includes('application/json') || ct.includes('application/problem+json')) {
        try {
          data = (await res.json()) as T;
        } catch {
          data = null;
        }
      }
      return { status: res.status, ok: res.ok, data };
    }
    await sleep(RETRY_BACKOFF_MS);
  }
};
