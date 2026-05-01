import { describe, expect, it } from 'vitest';
import { InvalidTokenError } from '../../../src/contexts/identity/domain/errors';
import { projectPrincipal } from '../../../src/contexts/identity/infrastructure/jose-jwt-verifier';

const TENANT_UUID = '11111111-1111-4111-8111-111111111111';

describe('projectPrincipal', () => {
  it('extracts subject, tenant, and known roles', () => {
    const principal = projectPrincipal({
      sub: 'kc-sub-123',
      tenant_id: TENANT_UUID,
      roles: ['owner', 'manager', 'unknown-role'],
      email: 'owner@cafe-roma.test',
    });
    expect(principal.subject).toBe('kc-sub-123');
    expect(principal.tenantId).toBe(TENANT_UUID);
    // Unknown roles are dropped — domain enum is the source of truth.
    expect(principal.roles).toEqual(['owner', 'manager']);
    expect(principal.email).toBe('owner@cafe-roma.test');
  });

  it('preserves locations when present', () => {
    const principal = projectPrincipal({
      sub: 'kc-sub-123',
      tenant_id: TENANT_UUID,
      roles: [],
      locations: ['loc-a', 'loc-b'],
    });
    expect(principal.locations).toEqual(['loc-a', 'loc-b']);
  });

  it('omits locations when claim is empty', () => {
    const principal = projectPrincipal({
      sub: 'kc-sub-123',
      tenant_id: TENANT_UUID,
      roles: [],
    });
    expect(principal.locations).toBeUndefined();
  });

  it('throws when subject is missing', () => {
    expect(() => projectPrincipal({ tenant_id: TENANT_UUID, roles: [] })).toThrow(
      InvalidTokenError,
    );
  });

  it('throws when tenant_id is missing', () => {
    expect(() => projectPrincipal({ sub: 'kc-sub-123', roles: [] })).toThrow(InvalidTokenError);
  });
});
