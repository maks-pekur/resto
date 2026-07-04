import { describe, expect, it } from 'vitest';
import type { FastifyRequest } from 'fastify';
import { MeController } from '../../../src/contexts/identity/interfaces/http/me.controller';
import type { Principal } from '../../../src/contexts/identity/domain/principal';

const makeReq = (activeBrandId?: string | null): FastifyRequest =>
  ({ activeBrandId }) as unknown as FastifyRequest;

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
    expect(ctrl.me(principal, makeReq(null))).toEqual({
      kind: 'operator',
      userId: 'u-1',
      email: 'op@example.com',
      tenantId: 't-1',
      baseRole: 'owner',
      activeBrandId: null,
    });
  });

  it('omits baseRole when absent', () => {
    const principal: Principal = {
      kind: 'operator',
      userId: 'u-2',
      email: 'op2@example.com',
    };
    expect(ctrl.me(principal, makeReq(null))).toEqual({
      kind: 'operator',
      userId: 'u-2',
      email: 'op2@example.com',
      activeBrandId: null,
    });
  });

  it('includes activeBrandId when the session has an active brand', () => {
    const principal: Principal = {
      kind: 'operator',
      userId: 'u-4',
      email: 'op4@example.com',
      tenantId: 't-1',
    };
    expect(ctrl.me(principal, makeReq('brand-uuid-1'))).toMatchObject({
      kind: 'operator',
      activeBrandId: 'brand-uuid-1',
    });
  });

  it('returns customer projection unchanged', () => {
    const principal: Principal = {
      kind: 'customer',
      userId: 'u-3',
      phone: '+12025551111',
      tenantId: 't-1',
    };
    expect(ctrl.me(principal, makeReq(null))).toEqual({
      kind: 'customer',
      userId: 'u-3',
      tenantId: 't-1',
    });
  });

  it('returns anonymous projection unchanged', () => {
    expect(ctrl.me({ kind: 'anonymous' }, makeReq(null))).toEqual({ kind: 'anonymous' });
  });
});
