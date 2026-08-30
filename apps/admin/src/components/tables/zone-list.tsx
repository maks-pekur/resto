import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { Pencil } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { TableZoneView } from '@/lib/queries/table-zones';

export interface ZoneListProps {
  readonly zones: readonly TableZoneView[];
  readonly locationSlug: string;
}

export function ZoneList({ zones, locationSlug }: ZoneListProps) {
  const { t } = useTranslation('translation', { keyPrefix: 'tables' });

  return (
    <div className="overflow-hidden rounded-md border">
      {zones.map((zone) => {
        const activeTables = zone.tables.filter((table) => table.status === 'active').length;
        return (
          <div
            key={zone.id}
            data-testid={`zone-row-${zone.id}`}
            className="hover:bg-muted/40 flex items-center gap-3 border-b px-3 py-2.5 last:border-b-0"
          >
            <span className="min-w-0 flex-1 truncate font-medium">{zone.name}</span>
            <Badge variant="secondary" className="tabular-nums" aria-label={t('tableCountAria')}>
              {activeTables}
            </Badge>
            {zone.status === 'archived' ? (
              <Badge variant="outline">{t('statusArchived')}</Badge>
            ) : null}
            <Button variant="ghost" size="icon" asChild aria-label={t('editZoneAction')}>
              <Link
                to="/locations/$slug/tables/$zoneId"
                params={{ slug: locationSlug, zoneId: zone.id }}
              >
                <Pencil className="size-4" />
              </Link>
            </Button>
          </div>
        );
      })}
    </div>
  );
}
