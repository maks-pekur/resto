import { describe, expect, it } from 'vitest';
import {
  MenuItemId,
  TenantId,
  type MenuItemId as MenuItemIdT,
  type TenantId as TenantIdT,
} from '../src';

const UUID_A = '00000000-0000-4000-8000-000000000001';
const UUID_B = '00000000-0000-4000-8000-000000000002';

const consumeTenantId = (_id: TenantIdT): void => undefined;
const consumeMenuItemId = (_id: MenuItemIdT): void => undefined;

describe('branded ids', () => {
  it('produce distinct types at compile time', () => {
    const tenantId = TenantId.parse(UUID_A);
    const menuItemId = MenuItemId.parse(UUID_B);

    consumeTenantId(tenantId);
    consumeMenuItemId(menuItemId);

    // @ts-expect-error MenuItemId is not assignable to TenantId — branded ids are distinct
    consumeTenantId(menuItemId);

    // @ts-expect-error TenantId is not assignable to MenuItemId — branded ids are distinct
    consumeMenuItemId(tenantId);

    // @ts-expect-error a raw string is not assignable to TenantId — branding requires explicit parse
    consumeTenantId(UUID_A);

    expect(tenantId).toBe(UUID_A);
    expect(menuItemId).toBe(UUID_B);
  });
});
