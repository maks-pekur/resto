import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useRouterState } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronsUpDown, MapPin } from 'lucide-react';
import { useEffectiveLocation } from '@/lib/hooks/use-effective-location';
import { ALL_LOCATIONS_SUB_PATH, locationHref, locationSubPath } from '@/lib/location-path';
import { setActiveLocationMutation, type PinnableLocation } from '@/lib/queries/locations';
import { showError } from '@/lib/ui/toast-helpers';
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
  const { t } = useTranslation('translation', { keyPrefix: 'common' });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const params = useParams({ strict: false });
  const { locationSlug } = useEffectiveLocation();
  const [switching, setSwitching] = useState(false);

  // On a brand-grain page the control is not rendered at all — the team page shows every member
  // whatever this said, and a filter that filters nothing misleads.
  const subPath = locationSubPath(pathname, params.locationSlug);
  const onLocationPage = params.locationSlug !== undefined;

  // The owner's location lives in the URL, so "every location" is an address they can be at. A
  // staff member's lives in the server-side session pin, which is always exactly one point —
  // there is no aggregate for them to switch to, and nothing to switch when they hold one location.
  const offersAllLocations = isOwner && subPath === ALL_LOCATIONS_SUB_PATH;
  const hasSomewhereToGo = isOwner || locations.length > 1;

  if (
    !hasSomewhereToGo ||
    locations.length === 0 ||
    (!onLocationPage && pathname !== ALL_LOCATIONS_SUB_PATH)
  ) {
    return null;
  }

  const activeLocation = locations.find((candidate) => candidate.slug === locationSlug);
  const triggerLabel = activeLocation?.name ?? 'All locations';

  const goTo = (slug: string | null): void => {
    void navigate({ href: locationHref(slug, subPath) });
  };

  const switchTo = (slug: string | null): void => {
    // The owner's switch is pure client-side navigation. A staff member's has to move the session
    // pin first: it is what authorises their next request, and `/v1/me` resolves their permissions
    // against it — navigating first would render a page the server has not agreed to yet.
    if (isOwner) {
      goTo(slug);
      return;
    }
    const target = locations.find((candidate) => candidate.slug === slug);
    if (!target || switching) return;

    setSwitching(true);
    void (async () => {
      try {
        const res = await setActiveLocationMutation(target.id);
        if (!res.ok) {
          showError(null, t('errorGeneric'));
          return;
        }
        await queryClient.invalidateQueries({ queryKey: ['identity'] });
        goTo(slug);
      } finally {
        setSwitching(false);
      }
    })();
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
                disabled={switching}
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
