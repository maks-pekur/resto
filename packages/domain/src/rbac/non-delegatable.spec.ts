import { describe, expect, it } from 'vitest';
import { containsNonDelegatable } from './non-delegatable';
import { SYSTEM_ROLES } from './system-roles';

// D-06 (Phase 10) + Skeptic BLOCK-4: order:cancel must never be swallowed by
// NON_DELEGATABLE — reject/cancel is a status transition, not a financial
// grant, so it must stay assignable to a custom role. This pins that a
// future widening of NON_DELEGATABLE semantics does not silently take away
// the order verbs the presets depend on.
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
