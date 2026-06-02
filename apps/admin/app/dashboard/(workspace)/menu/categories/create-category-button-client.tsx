'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { CategoryFormClient } from './category-form-client';
import type { CategoryListItemApi } from './page';

export interface CreateCategoryButtonProps {
  readonly allCategories: readonly CategoryListItemApi[];
}

export function CreateCategoryButton({
  allCategories,
}: CreateCategoryButtonProps): React.ReactElement {
  const t = useTranslations('menu.categories');
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <Button
        size="sm"
        onClick={() => {
          setOpen(true);
        }}
      >
        {t('addCategory')}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right">
          <SheetHeader>
            <SheetTitle>{t('createSheetTitle')}</SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-4">
            <CategoryFormClient
              mode="create"
              allCategories={allCategories}
              onClose={() => {
                setOpen(false);
              }}
            />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
