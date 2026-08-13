export interface PresetRoleDefinition {
  readonly slug: string;
  readonly nameEn: string;
  readonly nameRu: string;
  readonly permission: Record<string, string[]>;
}

export const PRESET_ROLES: readonly PresetRoleDefinition[] = [
  {
    slug: 'manager',
    nameEn: 'Manager',
    nameRu: 'Менеджер',
    permission: {
      menu: ['read', 'create', 'update', 'delete'],
      // D-06 (Phase 10): reject/cancel is a status transition, not a
      // financial grant — every preset gets it, billing stays owner-only.
      order: ['read', 'update-status', 'cancel'],
      staff: ['invite'],
      reports: ['read'],
      brand: ['read', 'update'],
      settings: ['update'],
    },
  },
  {
    slug: 'cashier-foh',
    nameEn: 'Cashier-FoH',
    nameRu: 'Кассир-зал',
    permission: {
      // D-06 (Phase 10): reject/cancel is a status transition, not a
      // financial grant — every preset gets it, billing stays owner-only.
      order: ['read', 'update-status', 'cancel'],
      menu: ['read'],
      brand: ['read'],
    },
  },
  {
    slug: 'kitchen',
    nameEn: 'Kitchen',
    nameRu: 'Кухня',
    permission: {
      // D-06 (Phase 10): reject/cancel is a status transition, not a
      // financial grant — every preset gets it, billing stays owner-only.
      order: ['read', 'update-status', 'cancel'],
      brand: ['read'],
    },
  },
] as const;
