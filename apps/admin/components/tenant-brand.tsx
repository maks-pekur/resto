import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';

const initialsOf = (displayName: string): string => {
  const words = displayName
    .trim()
    .split(/\s+/u)
    .filter((w) => w.length > 0);
  if (words.length === 0) return '?';
  const first = words[0] ?? '';
  if (words.length === 1) return first.slice(0, 2).toUpperCase();
  const last = words[words.length - 1] ?? '';
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
};

export function TenantBrand({
  tenant,
}: {
  readonly tenant: { readonly displayName: string; readonly slug: string };
}) {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton size="lg" className="cursor-default hover:bg-transparent">
          <div
            data-testid="tenant-brand-logo"
            className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg text-sm font-semibold"
          >
            {initialsOf(tenant.displayName)}
          </div>
          <div className="grid flex-1 text-left text-sm leading-tight">
            <span className="truncate font-medium" data-testid="tenant-brand-name">
              {tenant.displayName}
            </span>
            <span className="text-muted-foreground truncate text-xs">{tenant.slug}</span>
          </div>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
