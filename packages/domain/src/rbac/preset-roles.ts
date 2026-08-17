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
      order: ['read', 'update-status', 'cancel'],
      staff: ['invite'],
      reports: ['read'],
      brand: ['read', 'update'],
      settings: ['update'],
      tenant: ['read'],
    },
  },
  {
    slug: 'cashier-foh',
    nameEn: 'Cashier-FoH',
    nameRu: 'Кассир-зал',
    permission: {
      order: ['read', 'update-status', 'cancel'],
      menu: ['read'],
      brand: ['read'],
      tenant: ['read'],
    },
  },
  {
    slug: 'kitchen',
    nameEn: 'Kitchen',
    nameRu: 'Кухня',
    permission: {
      order: ['read', 'update-status', 'cancel'],
      brand: ['read'],
      tenant: ['read'],
    },
  },
] as const;
