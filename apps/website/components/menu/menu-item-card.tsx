'use client';

import Image from 'next/image';
import { useLocale } from 'next-intl';
import type { MenuItemDto } from '@resto/api-client/public';
import { localized } from '@/lib/i18n/localized';

interface MenuItemCardProps {
  readonly item: MenuItemDto;
  readonly onSelect: (id: string) => void;
  readonly unavailable?: boolean;
  readonly unavailableLabel?: string;
}

export function MenuItemCard({
  item,
  onSelect,
  unavailable = false,
  unavailableLabel = 'Unavailable today',
}: MenuItemCardProps) {
  const locale = useLocale();

  const handleClick = () => {
    if (unavailable) return;
    onSelect(item.id);
  };

  const name = localized(item.name, locale);
  const description = item.description ? localized(item.description, locale) : null;

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={name}
      aria-disabled={unavailable ? 'true' : undefined}
      className={[
        'group relative flex w-full flex-col overflow-hidden rounded-xl border border-[oklch(0.9_0_0)] bg-[oklch(0.97_0_0)] text-left transition-shadow',
        unavailable
          ? 'cursor-not-allowed opacity-50'
          : 'cursor-pointer hover:shadow-md focus-visible:ring-2 focus-visible:ring-[--ring]',
      ].join(' ')}
    >
      {item.imageUrl ? (
        <div className="relative h-40 w-full overflow-hidden">
          <Image
            src={item.imageUrl}
            alt=""
            fill
            className="object-cover"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          />
        </div>
      ) : (
        <div className="h-40 w-full bg-[oklch(0.93_0_0)]" aria-hidden="true" />
      )}

      {unavailable ? (
        <div
          role="img"
          aria-label={unavailableLabel}
          className="absolute inset-0 flex items-center justify-center bg-white/30"
        >
          <span className="rounded-md bg-white/80 px-3 py-1 text-sm font-medium text-[oklch(0.45_0_0)]">
            {unavailableLabel}
          </span>
        </div>
      ) : null}

      <div className="flex flex-1 flex-col gap-1 p-3">
        <h3 className="text-[20px] font-semibold leading-[1.2]">{name}</h3>
        {description ? (
          <p className="line-clamp-2 text-[16px] leading-[1.5] text-[oklch(0.45_0_0)]">
            {description}
          </p>
        ) : null}
        <p
          className="mt-auto pt-2 text-[16px] font-semibold tabular-nums"
          aria-label={`${item.basePrice} ${item.currency}`}
        >
          {item.basePrice} {item.currency}
        </p>
      </div>
    </button>
  );
}
