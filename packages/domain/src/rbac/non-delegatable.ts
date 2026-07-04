import type { Permission } from './permissions';

// D-04 (08.3): permissions never delegatable to custom roles; enforced on create/update/assign
export const NON_DELEGATABLE: Permission = {
  tenant: ['delete', 'transfer'],
  billing: ['update'],
  staff: ['remove'],
  ac: ['create', 'read', 'update', 'delete'],
} as const;

export function containsNonDelegatable(permission: Record<string, string[]>): boolean {
  for (const [resource, actions] of Object.entries(NON_DELEGATABLE) as [
    keyof typeof NON_DELEGATABLE,
    string[],
  ][]) {
    const requested = permission[resource] ?? [];
    if (actions.some((a) => requested.includes(a))) return true;
  }
  return false;
}
