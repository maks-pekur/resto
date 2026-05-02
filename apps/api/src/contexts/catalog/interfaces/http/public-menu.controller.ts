import { Controller, Get, Inject, NotFoundException, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { requireTenantContext } from '@resto/db';
import { GetMenuItemService } from '../../application/get-menu-item.service';
import { GetPublishedMenuService } from '../../application/get-published-menu.service';
import type { PublishedMenu, PublishedMenuItem } from '../../domain/published-menu';
import { mapCatalogError } from './error-mapping';

const wrap = async <T>(fn: () => Promise<T>): Promise<T> => {
  try {
    return await fn();
  } catch (err) {
    throw mapCatalogError(err);
  }
};

/**
 * Customer-facing read path. Tenant is resolved by the global
 * `TenantContextMiddleware` from the request host; absence of a
 * resolved tenant collapses these endpoints to 404 (the qr-menu only
 * makes sense at a tenant subdomain).
 */
@ApiTags('catalog')
@Controller('v1/menu')
export class PublicMenuController {
  constructor(
    @Inject(GetPublishedMenuService) private readonly getMenu: GetPublishedMenuService,
    @Inject(GetMenuItemService) private readonly getItem: GetMenuItemService,
  ) {}

  @Get()
  async menu(): Promise<PublishedMenu> {
    const ctx = requireTenantOr404();
    return wrap(() => this.getMenu.execute(ctx.tenantId));
  }

  @Get('items/:id')
  async item(@Param('id') id: string): Promise<PublishedMenuItem> {
    requireTenantOr404();
    return wrap(() => this.getItem.execute(id));
  }
}

const requireTenantOr404 = (): { readonly tenantId: string } => {
  try {
    return requireTenantContext();
  } catch {
    throw new NotFoundException('No tenant resolved for this host.');
  }
};
