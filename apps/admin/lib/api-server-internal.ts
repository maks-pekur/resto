import 'server-only';

const apiOrigin = (): string => process.env.NEXT_PUBLIC_API_ORIGIN ?? 'http://localhost:3000';

const internalToken = (): string => {
  const token = process.env.INTERNAL_API_TOKEN;
  if (!token) {
    throw new Error('INTERNAL_API_TOKEN is required for admin internal fetches');
  }
  return token;
};

interface InternalRequestOptions {
  readonly method?: 'GET' | 'POST' | 'DELETE';
  readonly body?: unknown;
}

export interface InternalApiResponse<T> {
  readonly status: number;
  readonly ok: boolean;
  readonly data: T | null;
}

export const apiFetchInternal = async <T>(
  path: string,
  options: InternalRequestOptions = {},
): Promise<InternalApiResponse<T>> => {
  const url = `${apiOrigin()}${path.startsWith('/') ? '' : '/'}${path}`;
  const res = await fetch(url, {
    method: options.method ?? 'GET',
    headers: {
      accept: 'application/json',
      'x-internal-token': internalToken(),
      ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    cache: 'no-store',
    redirect: 'manual',
  });
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
