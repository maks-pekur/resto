'use client';

import { cn } from '../lib/utils';
import { CheckIcon, NoPhotoIcon } from '../icons';
import { useGuestUi } from './guest-ui-provider';

const IMAGE_SIZES = '(min-width: 640px) 20vw, 33vw';

export interface IngredientTileProps {
  readonly type: 'radio' | 'checkbox';
  readonly name: string;
  readonly id: string;
  readonly label: string;
  readonly description?: string | null;
  readonly imageUrl?: string | null;
  readonly priceLabel?: string | null;
  readonly selected: boolean;
  readonly unavailable?: boolean;
  readonly onToggle: () => void;
}

export const IngredientTile = ({
  type,
  name,
  id,
  label,
  description,
  imageUrl,
  priceLabel,
  selected,
  unavailable = false,
  onToggle,
}: IngredientTileProps) => {
  const { t, Image } = useGuestUi();

  return (
    <label
      className={cn(
        'focus-within:ring-ring flex flex-col gap-1 rounded-2xl border-2 p-1.5 transition-colors focus-within:ring-2',
        selected ? 'border-primary bg-primary-tint' : 'bg-muted border-transparent',
        unavailable ? 'cursor-not-allowed opacity-45' : 'cursor-pointer',
      )}
    >
      <input
        type={type}
        className="sr-only"
        name={name}
        value={id}
        checked={selected}
        disabled={unavailable}
        onChange={() => {
          onToggle();
        }}
      />
      <div className="relative aspect-square w-full overflow-hidden rounded-xl">
        {imageUrl ? (
          <Image src={imageUrl} alt="" sizes={IMAGE_SIZES} className="size-full object-cover" />
        ) : (
          <NoPhotoIcon
            aria-hidden
            className="text-muted-foreground absolute inset-0 m-auto size-6"
          />
        )}
        {selected ? (
          <span className="bg-primary text-primary-foreground absolute top-1.5 end-1.5 flex size-5 items-center justify-center rounded-full">
            <CheckIcon aria-hidden className="size-3.5" />
          </span>
        ) : null}
        {unavailable ? (
          <span className="bg-background/85 text-foreground absolute inset-x-1.5 bottom-1.5 rounded-full px-2 py-1 text-center text-[0.6875rem] leading-tight font-bold">
            {t('item.unavailable')}
          </span>
        ) : null}
      </div>
      <div className="mt-auto flex flex-col items-center gap-0.5 px-0.5 pb-0.5 text-center">
        <span className="line-clamp-1 text-xs leading-tight font-extrabold">{label}</span>
        {description ? (
          <span className="text-muted-foreground line-clamp-1 text-xs leading-tight font-normal">
            {description}
          </span>
        ) : null}
        {priceLabel ? (
          <span
            className={cn(
              'mt-0.5 inline-flex w-fit rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums',
              selected
                ? 'bg-primary text-primary-foreground'
                : 'bg-primary-tint text-primary-strong',
            )}
          >
            {priceLabel}
          </span>
        ) : null}
      </div>
    </label>
  );
};
