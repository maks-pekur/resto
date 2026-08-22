import { useSuspenseQuery } from '@tanstack/react-query';
import { meQuery, meTenantsQuery } from '@/lib/queries/identity';
import { SidebarMenu, SidebarMenuItem } from '@/components/ui/sidebar';

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

// UI-SPEC S5: a static, non-interactive organization-identity block —
// D-15's one-session-one-organization model means there is nothing to
// switch between, but the address bar alone (D-21) is not enough for the
// tablet-in-the-kitchen usage this admin targets. Deliberately a plain,
// non-focusable, non-clickable element with no menu or expand affordance —
// it must read as inert, not as a broken or disabled control.
export function TenantIdentity() {
  const { data: meResult } = useSuspenseQuery(meQuery());
  const { data: tenantsResult } = useSuspenseQuery(meTenantsQuery());

  const tenantId = meResult.data?.tenantId;
  const tenants = tenantsResult.data?.tenants ?? [];
  const activeTenant = tenantId ? tenants.find((t) => t.id === tenantId) : undefined;
  const label = activeTenant?.displayName ?? '—';
  const subLabel = activeTenant?.slug ?? '—';

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <div
          data-testid="tenant-identity"
          className="flex h-12 w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-0!"
        >
          <div className="bg-sidebar-accent text-sidebar-accent-foreground flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg">
            <span className="text-xs font-semibold">{initialsOf(label)}</span>
          </div>
          <div className="grid flex-1 text-left text-sm leading-tight">
            <span className="truncate font-medium">{label}</span>
            <span className="text-muted-foreground truncate text-xs">{subLabel}</span>
          </div>
        </div>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
