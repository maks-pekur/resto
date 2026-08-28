// Must match a trusted origin on the api, which is built from ADMIN_WEB_URL
// (identity-core.module.ts). Both .env and .env.example ship
// http://admin.localhost:4000, so the previous hardcoded
// http://localhost:4000 was rejected with 403 INVALID_ORIGIN and seed-demo
// could not sign in at all.
const ADMIN_ORIGIN = process.env.ADMIN_WEB_URL ?? 'http://admin.localhost:4000';

export class OperatorHttpError extends Error {
  constructor(
    method: string,
    path: string,
    public readonly status: number,
    body: string,
  ) {
    super(`${method} ${path} → ${status.toString()}: ${body}`);
    this.name = 'OperatorHttpError';
  }
}

export class OperatorHttpClient {
  constructor(
    private readonly apiUrl: string,
    private readonly cookie: string,
    private readonly extraHeaders: Readonly<Record<string, string>> = {},
  ) {}

  withHeaders(extra: Readonly<Record<string, string>>): OperatorHttpClient {
    return new OperatorHttpClient(this.apiUrl, this.cookie, { ...this.extraHeaders, ...extra });
  }

  async get<TResponse>(path: string): Promise<TResponse> {
    return this.request<TResponse>('GET', path);
  }

  async post<TResponse>(path: string, body?: unknown): Promise<TResponse> {
    return this.request<TResponse>('POST', path, body);
  }

  private async request<TResponse>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
  ): Promise<TResponse> {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      cookie: this.cookie,
      ...this.extraHeaders,
    };
    const init: RequestInit = { method, headers };
    if (body !== undefined) init.body = JSON.stringify(body);

    const url = new URL(path, this.apiUrl).toString();
    const res = await fetch(url, init);
    if (!res.ok) {
      const text = await res.text();
      throw new OperatorHttpError(method, path, res.status, text);
    }
    if (res.status === 204) return undefined as TResponse;
    const ct = res.headers.get('content-type') ?? '';
    if (ct.includes('application/json') || ct.includes('application/problem+json')) {
      return (await res.json()) as TResponse;
    }
    return undefined as TResponse;
  }
}

const extractCookies = (headers: Headers): string => {
  const setCookie = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : [];
  return setCookie
    .map((h) => h.split(';')[0]?.trim() ?? '')
    .filter(Boolean)
    .join('; ');
};

export const signInAsOperator = async (
  apiUrl: string,
  email: string,
  password: string,
  tenantId: string,
): Promise<string> => {
  const signInRes = await fetch(new URL('/api/auth/sign-in/email', apiUrl).toString(), {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ADMIN_ORIGIN },
    body: JSON.stringify({ email, password }),
  });
  if (!signInRes.ok) {
    throw new OperatorHttpError(
      'POST',
      '/api/auth/sign-in/email',
      signInRes.status,
      await signInRes.text(),
    );
  }
  const signInCookie = extractCookies(signInRes.headers);

  const setActiveRes = await fetch(
    new URL('/api/auth/organization/set-active', apiUrl).toString(),
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: signInCookie,
        origin: ADMIN_ORIGIN,
      },
      body: JSON.stringify({ organizationId: tenantId }),
    },
  );
  if (!setActiveRes.ok) {
    throw new OperatorHttpError(
      'POST',
      '/api/auth/organization/set-active',
      setActiveRes.status,
      await setActiveRes.text(),
    );
  }
  const setActiveCookie = extractCookies(setActiveRes.headers);
  return setActiveCookie || signInCookie;
};

export const signInOnly = async (
  apiUrl: string,
  email: string,
  password: string,
): Promise<{ cookie: string; status: number }> => {
  const res = await fetch(new URL('/api/auth/sign-in/email', apiUrl).toString(), {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ADMIN_ORIGIN },
    body: JSON.stringify({ email, password }),
  });
  return { cookie: res.ok ? extractCookies(res.headers) : '', status: res.status };
};
