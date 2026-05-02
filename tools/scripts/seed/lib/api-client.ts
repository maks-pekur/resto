/**
 * Thin client for the Resto api's `/internal/v1/*` surface. The CLI
 * authenticates with the shared `INTERNAL_API_TOKEN` (ADR-0012); per-
 * user IAM is deferred to MVP-2.
 */

export interface ApiClientOptions {
  readonly apiUrl: string;
  readonly internalToken: string;
  /** Optional: if set, attached as `X-Tenant-Slug` for routes that need a tenant context. */
  readonly tenantSlug?: string;
}

export class ApiClient {
  constructor(private readonly options: ApiClientOptions) {}

  withTenantSlug(tenantSlug: string): ApiClient {
    return new ApiClient({ ...this.options, tenantSlug });
  }

  async post<TResponse>(path: string, body: unknown): Promise<TResponse> {
    return this.request<TResponse>('POST', path, body);
  }

  async get<TResponse>(path: string): Promise<TResponse> {
    return this.request<TResponse>('GET', path);
  }

  private async request<TResponse>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
  ): Promise<TResponse> {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-internal-token': this.options.internalToken,
    };
    if (this.options.tenantSlug) headers['x-tenant-slug'] = this.options.tenantSlug;

    const init: RequestInit = { method, headers };
    if (body !== undefined) init.body = JSON.stringify(body);

    const url = new URL(path, this.options.apiUrl).toString();
    const res = await fetch(url, init);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`${method} ${path} → ${res.status.toString()}: ${text}`);
    }
    if (res.status === 204) return undefined as TResponse;
    const ct = res.headers.get('content-type') ?? '';
    if (ct.includes('application/json') || ct.includes('application/problem+json')) {
      return (await res.json()) as TResponse;
    }
    return undefined as TResponse;
  }
}
