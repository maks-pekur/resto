import { useNavigate, useRouterState } from '@tanstack/react-router';
import { ChevronsUpDown, MapPin } from 'lucide-react';
import { Route as brandSlugLayoutRoute } from '@/routes/(protected)/$brandSlug/_layout';
import { useEffectiveLocation } from '@/lib/hooks/use-effective-location';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';

export interface LocationSwitcherOption {
  readonly id: string;
  readonly name: string;
  readonly brandId: string;
}

export interface LocationSwitcherProps {
  readonly isOwner: boolean;
  readonly locations: readonly LocationSwitcherOption[];
}

export function LocationSwitcher({ isOwner, locations }: LocationSwitcherProps) {
  // `from` is for the search-updater's type narrowing only — the switcher is
  // a cross-cutting sidebar component that renders under many different leaf
  // routes, so navigation must target the CURRENT pathname (an explicit
  // absolute `to`), not `from` re-interpolated (which would always land on
  // the brand-layout's own index route regardless of the page the operator
  // was actually on).
  const navigate = useNavigate({ from: brandSlugLayoutRoute.fullPath });
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { mode, locationId } = useEffectiveLocation();

  if (!isOwner || locations.length === 0) return null;

  const activeLocation =
    mode === 'single' && locationId !== undefined
      ? locations.find((l) => l.id === locationId)
      : undefined;
  const triggerLabel = mode === 'all' ? 'All locations' : (activeLocation?.name ?? 'All locations');

  // D-01/D-04: pure client-side URL filter — no apiFetch, no server
  // round-trip, no window.location.reload. Preserve other search params via
  // the updater form (D-01/RESEARCH.md Pattern 3).
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents -- 'all' documents the ?location sentinel (D-01)
  const switchTo = (value: 'all' | string): void => {
    void navigate({ to: pathname, search: (prev) => ({ ...prev, location: value }) });
  };

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="sm" data-testid="location-switcher-trigger">
              <MapPin className="size-4 opacity-60" />
              <span className="truncate">{triggerLabel}</span>
              <ChevronsUpDown className="ml-auto size-4 opacity-60" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-(--radix-dropdown-menu-trigger-width)">
            <DropdownMenuItem
              data-testid="location-switcher-all"
              onSelect={() => {
                switchTo('all');
              }}
            >
              <span className="truncate">All locations</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {locations.map((location) => (
              <DropdownMenuItem
                key={location.id}
                data-testid={`location-switcher-option-${location.id}`}
                onSelect={() => {
                  switchTo(location.id);
                }}
              >
                <span className="truncate">{location.name}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
