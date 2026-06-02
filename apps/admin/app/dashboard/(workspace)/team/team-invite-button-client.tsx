'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { InviteForm } from './invite-form-client';

type Role = 'owner' | 'admin' | 'staff';

export interface TeamInviteButtonProps {
  readonly inviterRole: Role | undefined;
}

export function TeamInviteButton({ inviterRole }: TeamInviteButtonProps): React.ReactElement {
  const t = useTranslations('dashboard');
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button
        size="sm"
        onClick={() => {
          setOpen(true);
        }}
      >
        {t('teamInviteBtn')}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right">
          <SheetHeader>
            <SheetTitle>{t('teamInviteTitle')}</SheetTitle>
          </SheetHeader>
          <div className="space-y-3 px-4 pb-4">
            <p className="text-muted-foreground text-sm">{t('teamInviteDescription')}</p>
            <InviteForm inviterRole={inviterRole} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
