/**
 * Keycloak admin REST client used by the seed CLI. Does the operations
 * the api's `KeycloakAdminAdapter` placeholder declares: ensure realm
 * roles exist, create the tenant user with role + `tenant_id`
 * attribute, rotate user passwords. Idempotent: a second run is a
 * no-op (each `ensure*` checks for existing state).
 */

export interface KeycloakAdminOptions {
  readonly adminUrl: string;
  readonly adminUsername: string;
  readonly adminPassword: string;
  readonly realm: string;
}

interface RealmRoleInfo {
  readonly id: string;
  readonly name: string;
}

interface UserInfo {
  readonly id: string;
  readonly email: string;
}

export class KeycloakAdmin {
  private accessToken: string | null = null;

  constructor(private readonly options: KeycloakAdminOptions) {}

  async ensureRealm(): Promise<void> {
    const token = await this.getAdminToken();
    const res = await this.adminFetch(token, `/realms/${this.options.realm}`);
    if (res.status === 404) {
      await this.adminFetch(token, '/realms', {
        method: 'POST',
        body: JSON.stringify({
          realm: this.options.realm,
          enabled: true,
          sslRequired: 'none',
        }),
      });
    }
  }

  async ensureRealmRoles(roles: readonly string[]): Promise<void> {
    const token = await this.getAdminToken();
    for (const name of roles) {
      const res = await this.adminFetch(token, `/realms/${this.options.realm}/roles/${name}`);
      if (res.status === 404) {
        await this.adminFetch(token, `/realms/${this.options.realm}/roles`, {
          method: 'POST',
          body: JSON.stringify({ name }),
        });
      }
    }
  }

  async ensureUser(input: {
    email: string;
    role: string;
    initialPassword: string;
    tenantId: string;
    tenantSlug: string;
  }): Promise<{ subject: string }> {
    const token = await this.getAdminToken();
    const existing = await this.adminFetch(
      token,
      `/realms/${this.options.realm}/users?email=${encodeURIComponent(input.email)}&exact=true`,
    );
    const list = (await existing.json()) as UserInfo[];
    let userId: string;
    if (list.length === 0) {
      await this.adminFetch(token, `/realms/${this.options.realm}/users`, {
        method: 'POST',
        body: JSON.stringify({
          username: input.email,
          email: input.email,
          enabled: true,
          emailVerified: true,
          attributes: { tenant_id: [input.tenantId], tenant_slug: [input.tenantSlug] },
          credentials: [{ type: 'password', value: input.initialPassword, temporary: true }],
        }),
      });
      const created = await this.adminFetch(
        token,
        `/realms/${this.options.realm}/users?email=${encodeURIComponent(input.email)}&exact=true`,
      );
      const createdList = (await created.json()) as UserInfo[];
      const first = createdList[0];
      if (!first) {
        throw new Error(`User ${input.email} was created but lookup returned empty.`);
      }
      userId = first.id;
    } else {
      const first = list[0];
      if (!first) {
        throw new Error(`Internal: existing user list is non-empty but indexable lookup failed.`);
      }
      userId = first.id;
    }
    const role = await this.lookupRealmRole(token, input.role);
    await this.adminFetch(
      token,
      `/realms/${this.options.realm}/users/${userId}/role-mappings/realm`,
      {
        method: 'POST',
        body: JSON.stringify([role]),
      },
    );
    return { subject: userId };
  }

  async resetUserPassword(input: { email: string; newPassword: string }): Promise<void> {
    const token = await this.getAdminToken();
    const lookup = await this.adminFetch(
      token,
      `/realms/${this.options.realm}/users?email=${encodeURIComponent(input.email)}&exact=true`,
    );
    const list = (await lookup.json()) as UserInfo[];
    const first = list[0];
    if (!first) {
      throw new Error(`User with email ${input.email} not found in realm ${this.options.realm}.`);
    }
    await this.adminFetch(token, `/realms/${this.options.realm}/users/${first.id}/reset-password`, {
      method: 'PUT',
      body: JSON.stringify({ type: 'password', value: input.newPassword, temporary: true }),
    });
    await this.adminFetch(token, `/realms/${this.options.realm}/users/${first.id}/logout`, {
      method: 'POST',
    });
  }

  async issueOwnerToken(input: {
    clientId: string;
    clientSecret: string;
    email: string;
    password: string;
  }): Promise<{ accessToken: string }> {
    const res = await fetch(
      `${this.options.adminUrl}/realms/${this.options.realm}/protocol/openid-connect/token`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'password',
          client_id: input.clientId,
          client_secret: input.clientSecret,
          username: input.email,
          password: input.password,
          scope: 'openid',
        }),
      },
    );
    if (!res.ok) {
      throw new Error(`Token grant failed (${res.status.toString()}): ${await res.text()}`);
    }
    const body = (await res.json()) as { access_token?: string };
    if (typeof body.access_token !== 'string') {
      throw new Error('Token grant response did not include access_token.');
    }
    return { accessToken: body.access_token };
  }

  private async lookupRealmRole(token: string, name: string): Promise<RealmRoleInfo> {
    const res = await this.adminFetch(token, `/realms/${this.options.realm}/roles/${name}`);
    if (!res.ok) {
      throw new Error(`Realm role "${name}" not found in realm ${this.options.realm}.`);
    }
    return (await res.json()) as RealmRoleInfo;
  }

  private async getAdminToken(): Promise<string> {
    if (this.accessToken) return this.accessToken;
    const res = await fetch(
      `${this.options.adminUrl}/realms/master/protocol/openid-connect/token`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'password',
          client_id: 'admin-cli',
          username: this.options.adminUsername,
          password: this.options.adminPassword,
        }),
      },
    );
    if (!res.ok) {
      throw new Error(`Keycloak admin auth failed (${res.status.toString()}): ${await res.text()}`);
    }
    const body = (await res.json()) as { access_token?: string };
    if (typeof body.access_token !== 'string') {
      throw new Error('Admin auth response did not include access_token.');
    }
    this.accessToken = body.access_token;
    return this.accessToken;
  }

  private async adminFetch(token: string, path: string, init: RequestInit = {}): Promise<Response> {
    const res = await fetch(`${this.options.adminUrl}/admin${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        ...(init.headers as Record<string, string> | undefined),
      },
    });
    if (!res.ok && res.status !== 404 && res.status !== 409) {
      throw new Error(
        `${init.method ?? 'GET'} ${path} → ${res.status.toString()}: ${await res.text()}`,
      );
    }
    return res;
  }
}
