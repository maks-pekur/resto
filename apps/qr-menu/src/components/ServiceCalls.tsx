import { useState } from 'react';
import { BellIcon, ReceiptIcon } from '@resto/ui';
import { requestService } from '../api/client';
import { t } from '../i18n';

type Kind = 'waiter' | 'bill';

/**
 * The two things a guest at a table asks for that are not food. Tapping twice does not queue a
 * second call — the server hands back the one already open — so the button just stays "asked".
 */
export const ServiceCalls = () => {
  const [asked, setAsked] = useState<Partial<Record<Kind, boolean>>>({});
  const [pending, setPending] = useState<Kind | null>(null);

  const call = (kind: Kind): void => {
    setPending(kind);
    void requestService(kind)
      .then((ok) => {
        setPending(null);
        if (ok) setAsked((prev) => ({ ...prev, [kind]: true }));
      })
      .catch(() => {
        setPending(null);
      });
  };

  const button = (kind: Kind, Icon: typeof BellIcon) => (
    <button
      type="button"
      disabled={pending === kind || asked[kind] === true}
      data-testid={`service-${kind}`}
      onClick={() => {
        call(kind);
      }}
      className="ring-border hover:bg-muted focus-visible:ring-ring flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold ring-1 transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:cursor-default disabled:opacity-60"
    >
      <Icon className="text-muted-foreground size-5 shrink-0" />
      {asked[kind] === true ? t(`service.${kind}Asked`) : t(`service.${kind}`)}
    </button>
  );

  return (
    <div className="flex gap-2">
      {button('waiter', BellIcon)}
      {button('bill', ReceiptIcon)}
    </div>
  );
};
