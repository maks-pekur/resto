'use client';

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
  /** Groups the guest still owes an answer to; the order cannot be placed until it is empty. */
  readonly unmetGroups: readonly MenuModifierGroupDto[];
  readonly livePrice: string;
  readonly chosenModifiers: readonly CartModifier[];
  readonly reset: () => void;
}

/** What the kitchen would put on the dish if nobody chose: iiko's `default_amount`. */
const preselected = (groups: readonly MenuModifierGroupDto[]): Map<string, Set<string>> => {
  const chosen = new Map<string, Set<string>>();
  for (const group of groups) {
    const defaults = group.options.filter((option) => option.defaultAmount > 0);
    if (defaults.length === 0) continue;
    const capped = group.maxSelectable > 0 ? defaults.slice(0, group.maxSelectable) : defaults;
    chosen.set(group.id, new Set(capped.map((option) => option.id)));
  }
  return chosen;
};

const requiredCount = (group: MenuModifierGroupDto): number =>
  Math.max(group.minSelectable, group.isRequired ? 1 : 0);

export const useItemSelection = (
  item: MenuItemDto | null,
  groups: readonly MenuModifierGroupDto[],
  locale: string,
): ItemSelection => {
  const [sizeOverride, setSizeOverride] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Map<string, Set<string>>>(() => preselected(groups));
  const [preselectedFor, setPreselectedFor] = useState(item?.id ?? null);

  // A new dish arrives with its own defaults; the hook outlives the sheet it fills.
  if (item !== null && item.id !== preselectedFor) {
    setPreselectedFor(item.id);
    setChosen(preselected(groups));
    setSizeOverride(null);
  }

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
        const group = groups.find((g) => g.id === groupId);
        const current = new Set(next.get(groupId) ?? []);
        if (current.has(optionId)) {
          current.delete(optionId);
        } else {
          // The server refuses an order past `maxSelectable`; the sheet should never build one.
          if (group !== undefined && current.size >= group.maxSelectable) return prev;
          current.add(optionId);
        }
        next.set(groupId, current);
        return next;
      });
    },
    unmetGroups: groups.filter((group) => (chosen.get(group.id)?.size ?? 0) < requiredCount(group)),
    livePrice,
    chosenModifiers,
    reset: () => {
      setSizeOverride(null);
      setChosen(preselected(groups));
    },
  };
};
