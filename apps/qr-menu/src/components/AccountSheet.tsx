import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, UserIcon } from '@resto/ui';
import { t } from '../i18n';

export interface AccountSheetProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

/**
 * A guest orders first and is asked who they are afterwards, so this is not a gate — it is where
 * someone who wants their orders back finds them. Sign-in itself waits on the customer identity
 * endpoints (`.planning/notes/guest-identity.md`).
 */
export const AccountSheet = ({ open, onOpenChange }: AccountSheetProps) => {
  const [phone, setPhone] = useState('');
  const [sent, setSent] = useState(false);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto max-h-dvh w-full max-w-lg gap-0 overflow-y-auto rounded-t-2xl p-0 pb-[env(safe-area-inset-bottom)]"
      >
        <span aria-hidden className="bg-muted mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full" />
        <SheetHeader className="items-center px-5 pt-4 pb-0 text-center">
          <span className="bg-muted mb-1 grid size-14 place-items-center rounded-full">
            <UserIcon className="text-muted-foreground size-7" />
          </span>
          <SheetTitle className="text-2xl font-extrabold">{t('account.title')}</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-4 px-5 pt-4 pb-6">
          <p className="text-muted-foreground text-center text-sm">{t('account.body')}</p>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-bold">{t('account.phoneLabel')}</span>
            <input
              value={phone}
              inputMode="tel"
              autoComplete="tel"
              maxLength={20}
              placeholder={t('account.phonePlaceholder')}
              onChange={(event) => {
                setPhone(event.target.value);
                setSent(false);
              }}
              className="border-input focus-visible:ring-ring h-12 rounded-xl border px-3 text-base focus-visible:ring-2 focus-visible:outline-none"
            />
          </label>

          <button
            type="button"
            disabled={phone.trim().length < 6}
            onClick={() => {
              setSent(true);
            }}
            className="bg-primary text-primary-foreground focus-visible:ring-ring flex h-12 w-full cursor-pointer items-center justify-center rounded-full px-5 text-base font-bold transition-transform active:scale-[0.99] focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t('account.submit')}
          </button>

          {sent ? (
            <p className="bg-muted rounded-xl px-4 py-3 text-center text-sm">{t('account.soon')}</p>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
};
