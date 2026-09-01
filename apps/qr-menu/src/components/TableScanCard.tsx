import { lazy, Suspense, useState } from 'react';
import { useCartStore } from '@resto/cart';
import { openTableSession, type ResolvedTable } from '../api/client';
import { t } from '../i18n';
import { canScanInPage } from './TableScanner';

const Scanner = lazy(async () => ({ default: (await import('./TableScanner')).TableScanner }));

/** Our codes carry the secret as `/t/<token>` — nothing else in them is worth reading. */
export const qrTokenFromScan = (raw: string): string | null => {
  try {
    const url = new URL(raw, window.location.origin);
    if (url.host !== window.location.host) return null;
    return /^\/t\/([^/]+)\/?$/.exec(url.pathname)?.[1] ?? null;
  } catch {
    return null;
  }
};

export interface TableScanCardProps {
  readonly title: string;
  readonly body: string;
  readonly onSeated: (table: ResolvedTable) => void;
  /** Opens the camera as soon as the card appears — for the sheet that exists to fix a bad scan. */
  readonly autoStart?: boolean;
}

/**
 * The one place a guest is asked to point their phone at the code. Their cart is untouched
 * throughout: nothing here navigates.
 */
export const TableScanCard = ({ title, body, onSeated, autoStart = false }: TableScanCardProps) => {
  const [scanning, setScanning] = useState(autoStart && canScanInPage());
  const [failed, setFailed] = useState(false);

  const applyScan = (raw: string): void => {
    const token = qrTokenFromScan(raw);
    if (token === null) {
      setFailed(true);
      return;
    }
    openTableSession(token)
      .then((resolved) => {
        useCartStore.getState().setTable(resolved);
        setScanning(false);
        setFailed(false);
        onSeated(resolved);
      })
      .catch(() => {
        setFailed(true);
      });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-extrabold">{title}</p>
        <p className="text-muted-foreground text-sm">{body}</p>
      </div>

      {scanning ? (
        <Suspense
          fallback={<p className="text-muted-foreground text-sm">{t('table.scanStarting')}</p>}
        >
          <Scanner
            onDecoded={applyScan}
            onUnavailable={() => {
              setScanning(false);
              setFailed(true);
            }}
          />
        </Suspense>
      ) : canScanInPage() ? (
        <button
          type="button"
          onClick={() => {
            setFailed(false);
            setScanning(true);
          }}
          className="bg-primary text-primary-foreground flex h-11 w-full cursor-pointer items-center justify-center rounded-full px-5 text-sm font-bold"
        >
          {t('table.scanAction')}
        </button>
      ) : (
        // No in-page camera — an inert button would only invite a tap that does nothing, so the
        // instruction takes its place.
        <p className="bg-muted rounded-xl px-4 py-3 text-sm">{t('table.scanWithCamera')}</p>
      )}

      {canScanInPage() ? (
        <p className="text-muted-foreground text-xs">{t('table.scanCartKept')}</p>
      ) : null}
      {failed ? <p className="text-destructive text-xs">{t('table.scanFailed')}</p> : null}
    </div>
  );
};
