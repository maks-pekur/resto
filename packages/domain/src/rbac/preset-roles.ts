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
      settings: ['update'],
      tenant: ['read'],
      // D-17 (10.3): manager can view the floor and print/download a QR, not edit tables
      table: ['read'],
    },
  },
  {
    slug: 'cashier-foh',
    nameEn: 'Cashier-FoH',
    nameRu: 'Кассир-зал',
    permission: {
      order: ['read', 'update-status', 'cancel'],
      menu: ['read'],
      tenant: ['read'],
    },
  },
  {
    slug: 'kitchen',
    nameEn: 'Kitchen',
    nameRu: 'Кухня',
    permission: {
      order: ['read', 'update-status', 'cancel'],
      tenant: ['read'],
    },
  },
] as const;
