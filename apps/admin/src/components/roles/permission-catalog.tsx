import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { PERMISSIONS_STATEMENT, NON_DELEGATABLE } from '@resto/domain';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

const RESOURCE_LABELS: Record<string, string> = {
  menu: 'Menu',
  order: 'Orders',
  staff: 'Team',
  reports: 'Reports',
  settings: 'Settings',
  billing: 'Billing',
  tenant: 'Tenant',
};

function buildHiddenSet(): Map<string, Set<string>> {
  const hidden = new Map<string, Set<string>>();
  for (const [resource, actions] of Object.entries(NON_DELEGATABLE)) {
    hidden.set(resource, new Set(actions as string[]));
  }
  return hidden;
}

const HIDDEN_SET = buildHiddenSet();

function isHidden(resource: string, action: string): boolean {
  return HIDDEN_SET.get(resource)?.has(action) === true;
}

interface PermissionCatalogProps {
  readonly value: Record<string, string[]>;
  readonly onChange: (next: Record<string, string[]>) => void;
}

export function PermissionCatalog({ value, onChange }: PermissionCatalogProps) {
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  const resources = Object.entries(PERMISSIONS_STATEMENT) as [string, readonly string[]][];

  const visibleResources = resources.filter(([resource, actions]) => {
    if (resource === 'ac') return false;
    const visible = (actions as string[]).filter((action) => !isHidden(resource, action));
    return visible.length > 0;
  });

  const toggle = (resource: string, action: string, checked: boolean) => {
    const current = value[resource] ?? [];
    const next = checked ? [...current, action] : current.filter((a) => a !== action);
    onChange({ ...value, [resource]: next });
  };

  return (
    <div className="flex flex-col">
      {visibleResources.map(([resource, actions], idx) => {
        const label = RESOURCE_LABELS[resource] ?? resource;
        const visibleActions = (actions as string[]).filter((a) => !isHidden(resource, a));
        const isOpen = openGroups[resource] ?? false;

        return (
          <div key={resource}>
            {idx > 0 && <Separator />}
            <Collapsible
              open={isOpen}
              onOpenChange={(open) => {
                setOpenGroups((prev) => ({ ...prev, [resource]: open }));
              }}
            >
              <CollapsibleTrigger
                className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/50"
                aria-label={`${label} permissions`}
              >
                <span>{label}</span>
                <ChevronRight
                  className={`size-4 transition-transform ${isOpen ? 'rotate-90' : ''}`}
                />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="flex flex-col gap-1 px-4 pb-3">
                  {visibleActions.map((action) => {
                    const checked = (value[resource] ?? []).includes(action);
                    return (
                      <div key={action} className="flex items-center justify-between py-2">
                        <span className="text-sm">{action}</span>
                        <Switch
                          checked={checked}
                          onCheckedChange={(c) => {
                            toggle(resource, action, c);
                          }}
                          aria-label={`${action} for ${label}`}
                        />
                      </div>
                    );
                  })}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        );
      })}
    </div>
  );
}
