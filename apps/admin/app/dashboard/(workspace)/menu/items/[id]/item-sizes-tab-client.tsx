'use client';

import * as React from 'react';
import type { ItemSizeApi } from './types';

export interface ItemSizesTabClientProps {
  readonly itemId: string;
  readonly sizes: readonly ItemSizeApi[];
  readonly onSizesChange: (sizes: readonly ItemSizeApi[]) => void;
}

// Task 5 of Plan 04b-07 replaces this scaffold with the inline-editor sizes UI.
export function ItemSizesTabClient(_: ItemSizesTabClientProps): React.ReactElement {
  return (
    <div className="rounded-lg border border-dashed border-input p-6 text-sm text-muted-foreground">
      Размеры — в Task 5.
    </div>
  );
}
