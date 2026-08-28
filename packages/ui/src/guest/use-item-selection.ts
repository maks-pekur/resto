import { useMemo, useState } from 'react';
import type { MenuItemDto, MenuModifierGroupDto } from '@resto/api-client/public';
import { formatMinorUnits, parseMinorUnits, type CartModifier } from '@resto/cart';
import { localized } from '../lib/localized';

export const isSingleChoiceGroup = (group: MenuModifierGroupDto): boolean =>
  group.minSelectable === 1 && group.maxSelectable === 1 && group.isRequired;

export interface ItemSelection {
  readonly sizeId: string | null;
  readonly selectSize: (sizeId: string) => void;
  readonly isOptionChosen: (groupId: string, optionId: string) => boolean;
  readonly toggleOption: (groupId: string, optionId: string, singleChoice: boolean) => void;
  readonly livePrice: string;
  readonly chosenModifiers: readonly CartModifier[];
  readonly reset: () => void;
}

export const useItemSelection = (
  item: MenuItemDto | null,
  groups: readonly MenuModifierGroupDto[],
  locale: string,
): ItemSelection => {
  const [sizeOverride, setSizeOverride] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Map<string, Set<string>>>(new Map());

  const defaultSizeId = item?.sizes.find((s) => s.isDefault)?.id ?? item?.sizes[0]?.id ?? null;
  const sizeId = sizeOverride ?? defaultSizeId;

  const chosenModifiers = useMemo<readonly CartModifier[]>(() => {
    const modifiers: CartModifier[] = [];
    for (const group of groups) {
      const picked = chosen.get(group.id);
      if (!picked) continue;
      for (const option of group.options) {
        if (!picked.has(option.id)) continue;
        modifiers.push({
          optionId: option.id,
          name: localized(option.name, locale),
          priceDelta: option.priceDelta,
          modifierGroupId: group.id,
          amount: 1,
        });
      }
    }
    return modifiers;
  }, [groups, chosen, locale]);

  const livePrice = useMemo(() => {
    if (!item) return '0.00';
    const size = sizeId ? item.sizes.find((s) => s.id === sizeId) : undefined;
    let minor = parseMinorUnits(size?.price ?? item.basePrice);
    for (const modifier of chosenModifiers) {
      minor += parseMinorUnits(modifier.priceDelta);
    }
    return formatMinorUnits(minor);
  }, [item, sizeId, chosenModifiers]);

  return {
    sizeId,
    selectSize: setSizeOverride,
    isOptionChosen: (groupId, optionId) => chosen.get(groupId)?.has(optionId) ?? false,
    toggleOption: (groupId, optionId, singleChoice) => {
      setChosen((prev) => {
        const next = new Map(prev);
        if (singleChoice) {
          next.set(groupId, new Set([optionId]));
          return next;
        }
        const current = new Set(next.get(groupId) ?? []);
        if (current.has(optionId)) {
          current.delete(optionId);
        } else {
          current.add(optionId);
        }
        next.set(groupId, current);
        return next;
      });
    },
    livePrice,
    chosenModifiers,
    reset: () => {
      setSizeOverride(null);
      setChosen(new Map());
    },
  };
};
