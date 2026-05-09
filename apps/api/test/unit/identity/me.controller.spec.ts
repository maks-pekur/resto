import { describe, expect, it } from 'vitest';
import { MeController } from '../../../src/contexts/identity/interfaces/http/me.controller';
import type { Principal } from '../../../src/contexts/identity/domain/principal';

describe('MeController', () => {
  const ctrl = new MeController();

  it('returns operator projection with baseRole when present', () => {
    const principal: Principal = {
      kind: 'operator',
      userId: 'u-1',
      email: 'op@example.com',
      tenantId: 't-1',
      baseRole: 'owner',
    };
    expect(ctrl.me(principal)).toEqual({
      kind: 'operator',
      userId: 'u-1',
      email: 'op@example.com',
      tenantId: 't-1',
      baseRole: 'owner',
    });
  });

  it('omits baseRole when absent', () => {
    const principal: Principal = {
      kind: 'operator',
      userId: 'u-2',
      email: 'op2@example.com',
    };
    expect(ctrl.me(principal)).toEqual({
      kind: 'operator',
      userId: 'u-2',
      email: 'op2@example.com',
    });
  });

  it('returns customer projection unchanged', () => {
    const principal: Principal = {
      kind: 'customer',
      userId: 'u-3',
      phone: '+12025551111',
      tenantId: 't-1',
    };
    expect(ctrl.me(principal)).toEqual({
      kind: 'customer',
      userId: 'u-3',
      tenantId: 't-1',
    });
  });

  it('returns anonymous projection unchanged', () => {
    expect(ctrl.me({ kind: 'anonymous' })).toEqual({ kind: 'anonymous' });
  });
});
