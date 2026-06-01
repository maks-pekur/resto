'use client';

import * as React from 'react';

export interface ItemModifiersTabClientProps {
  readonly itemId: string;
  readonly initialModifierGroupIds: readonly string[];
}

// Plan 04b-08 replaces this scaffold with the chip picker + Sheet for quick-add.
export function ItemModifiersTabClient(_: ItemModifiersTabClientProps): React.ReactElement {
  return (
    <div className="rounded-lg border border-dashed border-input p-6 text-sm text-muted-foreground">
      Модификаторы — в Plan 04b-08.
    </div>
  );
}
