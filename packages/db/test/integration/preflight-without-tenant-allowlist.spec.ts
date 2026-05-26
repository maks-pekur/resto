import { describe, expect, it, vi } from 'vitest';
import {
  assertWithoutTenantCallsiteRegistered,
  WithoutTenantAllowlistMisalignedError,
} from '../../src/preflight';
import { WITHOUT_TENANT_ALLOWLIST } from '../../src/withoutTenant.allowlist';
import { logger } from '../../src/logger';

describe('TEN-11: assertWithoutTenantCallsiteRegistered presence-check', () => {
  it('passes when every allowlist entry resolves to a real file on disk', () => {
    expect(() => {
      assertWithoutTenantCallsiteRegistered();
    }).not.toThrow();
  });

  it('throws WithoutTenantAllowlistMisalignedError listing the missing paths when a bogus entry is injected', () => {
    const bogus = 'packages/db/src/this-file-does-not-exist.ts';
    try {
      assertWithoutTenantCallsiteRegistered([...WITHOUT_TENANT_ALLOWLIST, bogus]);
      throw new Error('preflight should have thrown.');
    } catch (err) {
      expect(err).toBeInstanceOf(WithoutTenantAllowlistMisalignedError);
      const missing = (err as WithoutTenantAllowlistMisalignedError).missing;
      expect(missing).toContain(bogus);
    }
  });

  it('logs `{ allowed: <count> }` exactly once on the success path', () => {
    const spy = vi.spyOn(logger, 'info');
    try {
      assertWithoutTenantCallsiteRegistered();
      const calls = spy.mock.calls.filter(([first]) => {
        return (
          typeof first === 'object' &&
          first !== null &&
          (first as { allowed?: number }).allowed === WITHOUT_TENANT_ALLOWLIST.length
        );
      });
      expect(calls).toHaveLength(1);
    } finally {
      spy.mockRestore();
    }
  });
});
