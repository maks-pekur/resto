'use client';

import { useMemo, useState } from 'react';
import type {
  MenuItemDto,
  MenuModifierGroupDto,
  MenuModifierOptionDto,
} from '@resto/api-client/public';
import { formatMinorUnits, parseMinorUnits, type CartModifier } from '@resto/cart';
import { localized } from '../lib/localized';

export interface ItemSelection {
  readonly sizeId: string | null;
  readonly selectSize: (sizeId: string) => void;
  readonly isOptionChosen: (groupId: string, optionId: string) => boolean;
  readonly toggleOption: (groupId: string, optionId: string, singleChoice: boolean) => void;
  readonly excludedOptionIds: ReadonlySet<string>;
  readonly toggleExclusion: (optionId: string) => void;
  /** Groups the guest still owes an answer to; the order cannot be placed until it is empty. */
  readonly unmetGroups: readonly MenuModifierGroupDto[];
  readonly livePrice: string;
  readonly chosenModifiers: readonly CartModifier[];
  readonly excludedModifiers: readonly CartModifier[];
  readonly reset: () => void;
}

const requiredCount = (group: MenuModifierGroupDto): number => (group.isRequired ? 1 : 0);

export const useItemSelection = (
  item: MenuItemDto | null,
  groups: readonly MenuModifierGroupDto[],
  locale: string,
  optionsById: ReadonlyMap<string, MenuModifierOptionDto>,
): ItemSelection => {
  const [sizeOverride, setSizeOverride] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Map<string, Set<string>>>(() => new Map());
  const [excludedOptionIds, setExcludedOptionIds] = useState<ReadonlySet<string>>(() => new Set());
  const [selectionFor, setSelectionFor] = useState(item?.id ?? null);

  // A new dish arrives with an empty selection; the hook outlives the sheet it fills.
  if (item !== null && item.id !== selectionFor) {
    setSelectionFor(item.id);
    setChosen(new Map());
    setExcludedOptionIds(new Set());
    setSizeOverride(null);
  }

  const defaultSizeId = item?.sizes.find((s) => s.isDefault)?.id ?? item?.sizes[0]?.id ?? null;
  const sizeId = sizeOverride ?? defaultSizeId;

  const chosenModifiers = useMemo<readonly CartModifier[]>(() => {
    const modifiers: CartModifier[] = [];
    for (const group of groups) {
      const picked = chosen.get(group.id);
      if (!picked) continue;
      for (const optionId of group.optionIds) {
        if (!picked.has(optionId)) continue;
        const option = optionsById.get(optionId);
        if (!option) continue;
        modifiers.push({
          optionId,
          name: localized(option.name, locale),
          priceDelta: option.priceDelta,
          modifierGroupId: group.id,
          amount: 1,
          kind: 'added',
        });
      }
    }
    return modifiers;
  }, [groups, chosen, locale, optionsById]);

  const excludedModifiers = useMemo<readonly CartModifier[]>(() => {
    if (!item) return [];
    const modifiers: CartModifier[] = [];
    for (const line of item.compositionLines) {
      if (!line.removable || !excludedOptionIds.has(line.optionId)) continue;
      const option = optionsById.get(line.optionId);
      if (!option) continue;
      modifiers.push({
        optionId: line.optionId,
        name: localized(option.name, locale),
        priceDelta: '0',
        amount: 1,
        kind: 'excluded',
      });
    }
    return modifiers;
  }, [item, excludedOptionIds, optionsById, locale]);

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
    excludedOptionIds,
    toggleExclusion: (optionId) => {
      setExcludedOptionIds((prev) => {
        const next = new Set(prev);
        if (next.has(optionId)) {
          next.delete(optionId);
        } else {
          next.add(optionId);
        }
        return next;
      });
    },
    unmetGroups: groups.filter((group) => (chosen.get(group.id)?.size ?? 0) < requiredCount(group)),
    livePrice,
    chosenModifiers,
    excludedModifiers,
    reset: () => {
      setSizeOverride(null);
      setChosen(new Map());
      setExcludedOptionIds(new Set());
    },
  };
};
