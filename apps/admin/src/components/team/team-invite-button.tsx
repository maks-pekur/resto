import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { InviteForm } from './invite-form';

type Role = 'owner' | 'admin' | 'staff';

export interface TeamInviteButtonProps {
  readonly inviterRole: Role | undefined;
}

export function TeamInviteButton({ inviterRole }: TeamInviteButtonProps) {
  const { t } = useTranslation('translation', { keyPrefix: 'dashboard' });
  const [open, setOpen] = useState(false);

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
            <InviteForm
              inviterRole={inviterRole}
              onSuccess={() => {
                setOpen(false);
              }}
            />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
