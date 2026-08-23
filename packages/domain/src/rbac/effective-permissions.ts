import { SYSTEM_ROLES } from './system-roles';

const SYSTEM_ROLE_SLUGS = new Set(['owner', 'admin', 'staff'] as const);

export type EffectivePermissionSet = Record<string, readonly string[]>;

export function computeEffectivePermissions(
  memberRoleCsv: string,
  customRoleLookup: (slug: string) => Record<string, string[]> | null,
): EffectivePermissionSet {
  const effective: Record<string, Set<string>> = {};

  const parts = memberRoleCsv
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean);

  for (const slug of parts) {
    const perms: Record<string, readonly string[]> | null = SYSTEM_ROLE_SLUGS.has(
      slug as 'owner' | 'admin' | 'staff',
    )
      ? SYSTEM_ROLES[slug as 'owner' | 'admin' | 'staff']
      : customRoleLookup(slug);

    if (!perms) continue;
    for (const [resource, actions] of Object.entries(perms)) {
      effective[resource] ??= new Set();
      for (const action of actions) {
        effective[resource].add(action);
      }
    }
  }

  const result: EffectivePermissionSet = {};
  for (const [resource, actions] of Object.entries(effective)) {
    result[resource] = Array.from(actions);
  }
  return result;
}

export function isSubsetOf(
  target: Record<string, string[]>,
  actorEffective: EffectivePermissionSet,
): boolean {
  for (const [resource, actions] of Object.entries(target)) {
    const actorActions = actorEffective[resource];
    if (!actorActions) return false;
    for (const action of actions) {
      if (!actorActions.includes(action)) return false;
    }
  }
  return true;
}
