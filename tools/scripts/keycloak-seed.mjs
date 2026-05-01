#!/usr/bin/env node
/**
 * Seed the local-dev Keycloak with the `resto` realm: realm roles
 * (owner / manager / kitchen / waiter), the `resto-api` confidential
 * client, four test users (one per role), and protocol mappers that
 * project `roles` and `tenant_id` claims onto issued tokens.
 *
 * Idempotent: re-runs are safe and leave state unchanged. Intended to
 * run once after `pnpm dev:up` brings Keycloak online — there is no
 * manual UI clicking. Production realms are provisioned via the seed
 * CLI (RES-81) instead.
 */

const ADMIN_URL = process.env.KEYCLOAK_ADMIN_URL ?? 'http://localhost:8080';
const ADMIN_USER = process.env.KEYCLOAK_ADMIN ?? 'admin';
const ADMIN_PASSWORD = process.env.KEYCLOAK_ADMIN_PASSWORD ?? 'admin_dev_password';

const REALM = 'resto';
const CLIENT_ID = 'resto-api';
const ROLES = ['owner', 'manager', 'kitchen', 'waiter'];
const TENANT_ID = '00000000-0000-4000-8000-000000000001';
const TENANT_SLUG = 'cafe-roma';

const log = (msg, extra = {}) => {
  const fields = Object.entries(extra)
    .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
    .join(' ');
  console.log(`[keycloak-seed] ${msg}${fields ? ` ${fields}` : ''}`);
};

const getAdminToken = async () => {
  const res = await fetch(`${ADMIN_URL}/realms/master/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'password',
      client_id: 'admin-cli',
      username: ADMIN_USER,
      password: ADMIN_PASSWORD,
    }),
  });
  if (!res.ok) {
    throw new Error(`Failed to get admin token (${res.status}): ${await res.text()}`);
  }
  const body = await res.json();
  return body.access_token;
};

const adminFetch = async (token, path, init = {}) => {
  const res = await fetch(`${ADMIN_URL}/admin${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok && res.status !== 409) {
    throw new Error(`${init.method ?? 'GET'} ${path} → ${res.status}: ${await res.text()}`);
  }
  return res;
};

const getJson = async (token, path) => {
  const res = await adminFetch(token, path);
  if (res.status === 404) return null;
  return res.json();
};

const ensureRealm = async (token) => {
  const existing = await getJson(token, `/realms/${REALM}`);
  if (existing) {
    log('realm exists', { realm: REALM });
    return;
  }
  await adminFetch(token, '/realms', {
    method: 'POST',
    body: JSON.stringify({ realm: REALM, enabled: true, sslRequired: 'none' }),
  });
  log('realm created', { realm: REALM });
};

const ensureRoles = async (token) => {
  for (const name of ROLES) {
    const existing = await getJson(token, `/realms/${REALM}/roles/${name}`);
    if (existing) continue;
    await adminFetch(token, `/realms/${REALM}/roles`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
    log('role created', { role: name });
  }
};

const ensureClient = async (token) => {
  const list = await getJson(token, `/realms/${REALM}/clients?clientId=${CLIENT_ID}`);
  if (Array.isArray(list) && list.length > 0) {
    log('client exists', { clientId: CLIENT_ID });
    return list[0].id;
  }
  await adminFetch(token, `/realms/${REALM}/clients`, {
    method: 'POST',
    body: JSON.stringify({
      clientId: CLIENT_ID,
      enabled: true,
      protocol: 'openid-connect',
      publicClient: false,
      serviceAccountsEnabled: true,
      directAccessGrantsEnabled: true,
      standardFlowEnabled: true,
      redirectUris: ['http://localhost:3000/*'],
      webOrigins: ['http://localhost:3000'],
      attributes: { 'access.token.lifespan': '300' },
    }),
  });
  const created = await getJson(token, `/realms/${REALM}/clients?clientId=${CLIENT_ID}`);
  log('client created', { clientId: CLIENT_ID });
  return created[0].id;
};

const ensureUser = async (token, { email, role }) => {
  const list = await getJson(
    token,
    `/realms/${REALM}/users?email=${encodeURIComponent(email)}&exact=true`,
  );
  if (Array.isArray(list) && list.length > 0) {
    log('user exists', { email });
    return list[0].id;
  }
  await adminFetch(token, `/realms/${REALM}/users`, {
    method: 'POST',
    body: JSON.stringify({
      username: email,
      email,
      enabled: true,
      emailVerified: true,
      attributes: {
        tenant_id: [TENANT_ID],
        tenant_slug: [TENANT_SLUG],
      },
      credentials: [{ type: 'password', value: 'devpass', temporary: false }],
    }),
  });
  const created = await getJson(
    token,
    `/realms/${REALM}/users?email=${encodeURIComponent(email)}&exact=true`,
  );
  const userId = created[0].id;
  // Attach realm role
  const roleObj = await getJson(token, `/realms/${REALM}/roles/${role}`);
  await adminFetch(token, `/realms/${REALM}/users/${userId}/role-mappings/realm`, {
    method: 'POST',
    body: JSON.stringify([roleObj]),
  });
  log('user created', { email, role });
  return userId;
};

const ensureProtocolMappers = async (token, clientUuid) => {
  // Map realm roles into a flat `roles` claim and map the user's
  // `tenant_id` attribute into a top-level claim. Both are read by the
  // api's JoseJwtVerifier.
  const desired = [
    {
      name: 'roles',
      protocol: 'openid-connect',
      protocolMapper: 'oidc-usermodel-realm-role-mapper',
      config: {
        'claim.name': 'roles',
        'jsonType.label': 'String',
        multivalued: 'true',
        'access.token.claim': 'true',
        'id.token.claim': 'true',
      },
    },
    {
      name: 'tenant_id',
      protocol: 'openid-connect',
      protocolMapper: 'oidc-usermodel-attribute-mapper',
      config: {
        'user.attribute': 'tenant_id',
        'claim.name': 'tenant_id',
        'jsonType.label': 'String',
        'access.token.claim': 'true',
        'id.token.claim': 'true',
      },
    },
  ];
  const existing =
    (await getJson(token, `/realms/${REALM}/clients/${clientUuid}/protocol-mappers/models`)) ?? [];
  const existingNames = new Set(existing.map((m) => m.name));
  for (const mapper of desired) {
    if (existingNames.has(mapper.name)) continue;
    await adminFetch(token, `/realms/${REALM}/clients/${clientUuid}/protocol-mappers/models`, {
      method: 'POST',
      body: JSON.stringify(mapper),
    });
    log('mapper created', { name: mapper.name });
  }
};

const main = async () => {
  log('starting', { adminUrl: ADMIN_URL, realm: REALM });
  const token = await getAdminToken();
  await ensureRealm(token);
  await ensureRoles(token);
  const clientUuid = await ensureClient(token);
  await ensureProtocolMappers(token, clientUuid);
  for (const role of ROLES) {
    await ensureUser(token, { email: `${role}@${TENANT_SLUG}.test`, role });
  }
  log('done');
  log('test tenant id', { tenantId: TENANT_ID });
  log('test users', { password: 'devpass', emails: ROLES.map((r) => `${r}@${TENANT_SLUG}.test`) });
};

main().catch((err) => {
  console.error('[keycloak-seed] failed:', err);
  process.exit(1);
});
