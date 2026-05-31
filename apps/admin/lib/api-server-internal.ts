import 'server-only';
import { apiOrigin, internalApiToken } from './env';

interface InternalRequestOptions {
  readonly method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  readonly body?: unknown;
}

export interface InternalApiResponse<T> {
  readonly status: number;
  readonly ok: boolean;
  readonly data: T | null;
}

const TIMEOUT_GET_MS = 10_000;
const TIMEOUT_MUTATION_MS = 30_000;
const RETRY_BACKOFF_MS = 500;

const isRetryableServerError = (status: number): boolean => status >= 500 && status <= 504;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const executeWithRetry = async (
  input: string,
  init: Omit<RequestInit, 'signal'>,
  opts: { readonly isGet: boolean; readonly timeoutMs: number },
): Promise<Response> => {
  const maxAttempts = opts.isGet ? 2 : 1;
  for (let attempt = 1; ; attempt += 1) {
    const res = await fetch(input, { ...init, signal: AbortSignal.timeout(opts.timeoutMs) });
    if (!opts.isGet || !isRetryableServerError(res.status) || attempt >= maxAttempts) {
      return res;
    }
    await sleep(RETRY_BACKOFF_MS);
  }
};

export const apiFetchInternal = async <T>(
  path: string,
  options: InternalRequestOptions = {},
): Promise<InternalApiResponse<T>> => {
  const url = `${apiOrigin()}${path.startsWith('/') ? '' : '/'}${path}`;
  const method = options.method ?? 'GET';
  const isGet = method === 'GET';
  let res: Response;
  try {
    res = await executeWithRetry(
      url,
      {
        method,
        headers: {
          accept: 'application/json',
          'x-internal-token': internalApiToken(),
          ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
        },
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        cache: 'no-store',
        redirect: 'manual',
      },
      { isGet, timeoutMs: isGet ? TIMEOUT_GET_MS : TIMEOUT_MUTATION_MS },
    );
  } catch (err) {
    if (err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError')) {
      return { status: 0, ok: false, data: null };
    }
    throw err;
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
  return { status: res.status, ok: res.ok, data };
};
