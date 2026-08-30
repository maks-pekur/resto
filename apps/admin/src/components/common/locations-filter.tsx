import { useTranslation } from 'react-i18next';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export const ALL_LOCATIONS = 'all';

export interface FilterableLocation {
  readonly id: string;
  readonly name: string;
}

export interface LocationsFilterProps {
  readonly locations: readonly FilterableLocation[];
  readonly value: string;
  readonly onChange: (locationId: string) => void;
  readonly className?: string;
}

/**
 * One point is not a choice — with a single location the filter renders nothing at all
 * rather than a select the operator can never change.
 */
export function LocationsFilter({
  locations,
  value,
  onChange,
  className = 'w-48',
}: LocationsFilterProps) {
  const { t } = useTranslation('translation', { keyPrefix: 'dashboard' });

  if (locations.length <= 1) return null;

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger size="sm" className={className} aria-label={t('filterLocationLabel')}>
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
  );
}
