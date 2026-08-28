import { useNavigate, useParams, useRouterState } from '@tanstack/react-router';
import { ChevronsUpDown, MapPin } from 'lucide-react';
import { useEffectiveLocation } from '@/lib/hooks/use-effective-location';
import { ALL_LOCATIONS_SUB_PATH, locationHref, locationSubPath } from '@/lib/location-path';
import type { PinnableLocation } from '@/lib/queries/locations';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';

export interface LocationSwitcherProps {
  readonly isOwner: boolean;
  readonly locations: readonly PinnableLocation[];
}

export function LocationSwitcher({ isOwner, locations }: LocationSwitcherProps) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const params = useParams({ strict: false });
  const { locationSlug } = useEffectiveLocation();

  // On a brand-grain page the control is not rendered at all — the team page shows every member
  // whatever this said, and a filter that filters nothing misleads.
  const subPath = locationSubPath(pathname, params.locationSlug);
  const onLocationPage = params.locationSlug !== undefined;
  const offersAllLocations = subPath === ALL_LOCATIONS_SUB_PATH;

  if (
    !isOwner ||
    locations.length === 0 ||
    (!onLocationPage && pathname !== ALL_LOCATIONS_SUB_PATH)
  ) {
    return null;
  }

  const activeLocation = locations.find((candidate) => candidate.slug === locationSlug);
  const triggerLabel = activeLocation?.name ?? 'All locations';

  // Pure client-side navigation — no apiFetch, no server round-trip, no full-page reload.
  const switchTo = (slug: string | null): void => {
    void navigate({ href: locationHref(slug, subPath) });
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
            {offersAllLocations ? (
              <>
                <DropdownMenuItem
                  data-testid="location-switcher-all"
                  onSelect={() => {
                    switchTo(null);
                  }}
                >
                  <span className="truncate">All locations</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            ) : null}
            {locations.map((location) => (
              <DropdownMenuItem
                key={location.id}
                data-testid={`location-switcher-option-${location.slug}`}
                onSelect={() => {
                  switchTo(location.slug);
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
