import { describe, expect, it } from 'vitest';
import {
  ac,
  ownerRole,
  adminRole,
  staffRole,
} from '../../../src/contexts/identity/infrastructure/better-auth/access-control';

describe('Better Auth access control', () => {
  it('exposes a defined ac instance', () => {
    expect(ac).toBeDefined();
    expect(typeof ac.newRole).toBe('function');
  });

  it('owner permits menu:update', () => {
    expect(ownerRole.authorize({ menu: ['update'] }).success).toBe(true);
  });

  it('admin denies billing:update', () => {
    expect(adminRole.authorize({ billing: ['update'] }).success).toBe(false);
  });

  it('admin denies tenant:delete', () => {
    expect(adminRole.authorize({ tenant: ['delete'] }).success).toBe(false);
  });

  it('staff denies all permissions by default', () => {
    expect(staffRole.authorize({ menu: ['read'] }).success).toBe(false);
    expect(staffRole.authorize({ order: ['read'] }).success).toBe(false);
  });

  it('grants tenant.read to owner, admin, and staff', () => {
    for (const role of [ownerRole, adminRole, staffRole]) {
      const result = role.authorize({ tenant: ['read'] });
      expect(result.success).toBe(true);
    }
  });
});
