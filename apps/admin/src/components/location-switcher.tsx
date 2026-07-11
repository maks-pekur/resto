import { useQueryClient } from '@tanstack/react-query';
import { ChevronsUpDown, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api-client';
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
  readonly activeLocationId: string | null;
}

export function LocationSwitcher({ isOwner, locations, activeLocationId }: LocationSwitcherProps) {
  const qc = useQueryClient();

  if (!isOwner || locations.length === 0) return null;

  const activeLocation = activeLocationId
    ? locations.find((l) => l.id === activeLocationId)
    : undefined;
  const triggerLabel = activeLocation?.name ?? 'Brand-global';

  const switchTo = async (locationId: string | null) => {
    const res = await apiFetch<{ locationId: string | null }>('/v1/me/set-active-location', {
      method: 'POST',
      body: { locationId },
    });
    if (res.status === 403) {
      toast.error('You do not have access to this location.');
      return;
    }
    void qc.invalidateQueries({ queryKey: ['identity', 'active-location'] });
    window.location.reload();
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
              onSelect={() => {
                void switchTo(null);
              }}
            >
              <span className="truncate">Brand-global (all locations)</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {locations.map((location) => (
              <DropdownMenuItem
                key={location.id}
                onSelect={() => {
                  void switchTo(location.id);
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
