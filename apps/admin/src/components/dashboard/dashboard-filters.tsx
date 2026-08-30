import { useTranslation } from 'react-i18next';
import { DateRangePicker } from '@/components/common/date-range-picker';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { DateRange } from '@/lib/date-range';

export const ALL_LOCATIONS = 'all';

export interface DashboardFilterLocation {
  readonly id: string;
  readonly name: string;
}

export interface DashboardFiltersProps {
  readonly locations: readonly DashboardFilterLocation[];
  readonly locationId: string;
  readonly onLocationChange: (locationId: string) => void;
  readonly range: DateRange;
  readonly onRangeChange: (range: DateRange) => void;
}

export function DashboardFilters({
  locations,
  locationId,
  onLocationChange,
  range,
  onRangeChange,
}: DashboardFiltersProps) {
  const { t } = useTranslation('translation', { keyPrefix: 'dashboard' });

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {/* One point is not a choice — the filter appears only when there is something to pick. */}
      {locations.length > 1 ? (
        <Select value={locationId} onValueChange={onLocationChange}>
          <SelectTrigger size="sm" className="w-48" aria-label={t('filterLocationLabel')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_LOCATIONS}>{t('filterLocationAll')}</SelectItem>
            {locations.map((location) => (
              <SelectItem key={location.id} value={location.id}>
                {location.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
      <DateRangePicker value={range} onChange={onRangeChange} />
    </div>
  );
}
