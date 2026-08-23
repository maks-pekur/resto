import { describe, expect, it } from 'vitest';
import { containsNonDelegatable } from './non-delegatable';
import { SYSTEM_ROLES } from './system-roles';

describe('containsNonDelegatable — order:cancel regression (D-06, Phase 10)', () => {
  it('containsNonDelegatable({ order: ["cancel"] }) === false — order:cancel is delegatable', () => {
    expect(containsNonDelegatable({ order: ['cancel'] })).toBe(false);
  });

  it('containsNonDelegatable({ order: ["read","update-status","cancel"] }) === false', () => {
    expect(containsNonDelegatable({ order: ['read', 'update-status', 'cancel'] })).toBe(false);
  });

  it('containsNonDelegatable({ billing: ["update"] }) === true — untouched guarantee', () => {
    expect(containsNonDelegatable({ billing: ['update'] })).toBe(true);
  });

  it('SYSTEM_ROLES.staff has no order key — bare staff role stays order-less', () => {
    expect('order' in SYSTEM_ROLES.staff).toBe(false);
  });
});
