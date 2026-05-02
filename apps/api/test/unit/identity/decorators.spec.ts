import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Public } from '../../../src/contexts/identity/interfaces/http/decorators/public.decorator';
import { IS_PUBLIC_KEY } from '../../../src/contexts/identity/interfaces/http/guards/auth.guard';
import { Permissions } from '../../../src/contexts/identity/interfaces/http/decorators/permissions.decorator';
import { PERMISSIONS_KEY } from '../../../src/contexts/identity/interfaces/http/guards/permissions.guard';
import {
  extractCurrentOperator,
  extractCurrentCustomer,
  extractCurrentPrincipal,
} from '../../../src/contexts/identity/interfaces/http/decorators/current-principal.decorator';
import type { Principal } from '../../../src/contexts/identity/domain/principal';

const buildCtx = (req: unknown) =>
  ({
    switchToHttp: () => ({ getRequest: () => req }),
  }) as never;

describe('decorators', () => {
  describe('@Public', () => {
    it('sets identity:public metadata to true', () => {
      class Ctrl {
        @Public()
        method() {}
      }
      const reflector = new Reflector();
      const value = reflector.get(IS_PUBLIC_KEY, Ctrl.prototype.method);
      expect(value).toBe(true);
    });
  });

  describe('@Permissions', () => {
    it('sets identity:permissions metadata with the spec', () => {
      class Ctrl {
        @Permissions({ menu: ['update'] })
        method() {}
      }
      const reflector = new Reflector();
      const value = reflector.get(PERMISSIONS_KEY, Ctrl.prototype.method);
      expect(value).toEqual({ menu: ['update'] });
    });
  });

  describe('extractCurrentPrincipal', () => {
    it('returns the principal from req when present', () => {
      const principal: Principal = { kind: 'operator', userId: 'u1', email: 'op@example.com' };
      const result = extractCurrentPrincipal(undefined, buildCtx({ principal }));
      expect(result).toEqual(principal);
    });

    it('returns AnonymousPrincipal when req.principal is undefined', () => {
      const result = extractCurrentPrincipal(undefined, buildCtx({}));
      expect(result).toEqual({ kind: 'anonymous' });
    });
  });

  describe('extractCurrentOperator', () => {
    it('returns operator when principal.kind is operator', () => {
      const principal: Principal = { kind: 'operator', userId: 'u1', email: 'op@example.com' };
      expect(extractCurrentOperator(undefined, buildCtx({ principal }))).toEqual(principal);
    });

    it('throws Forbidden when principal kind is customer', () => {
      const principal: Principal = {
        kind: 'customer',
        userId: 'c1',
        phone: '+380000000000',
        tenantId: 't1',
      };
      expect(() => extractCurrentOperator(undefined, buildCtx({ principal }))).toThrow(
        ForbiddenException,
      );
    });

    it('throws Forbidden when principal is missing', () => {
      expect(() => extractCurrentOperator(undefined, buildCtx({}))).toThrow(ForbiddenException);
    });
  });

  describe('extractCurrentCustomer', () => {
    it('returns customer when principal.kind is customer', () => {
      const principal: Principal = {
        kind: 'customer',
        userId: 'c1',
        phone: '+380000000000',
        tenantId: 't1',
      };
      expect(extractCurrentCustomer(undefined, buildCtx({ principal }))).toEqual(principal);
    });

    it('throws Forbidden when principal kind is operator', () => {
      const principal: Principal = { kind: 'operator', userId: 'u1', email: 'op@example.com' };
      expect(() => extractCurrentCustomer(undefined, buildCtx({ principal }))).toThrow(
        ForbiddenException,
      );
    });
  });
});
