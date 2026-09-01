import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useCartStore } from '@resto/cart';
import { openTableSession, type ResolvedTable } from '../api/client';
import { t } from '../i18n';
import { canScanInPage } from './TableScanner';

const Scanner = lazy(async () => ({ default: (await import('./TableScanner')).TableScanner }));

const SEATED_PAUSE_MS = 1400;

/** Our codes carry the secret as `/t/<token>` — nothing else in them is worth reading. */
export const qrTokenFromScan = (raw: string): string | null => {
  try {
    const url = new URL(raw, window.location.origin);
    // A phone on the LAN browses a different host than the one printed on the code, and the
    // token is validated server-side anyway — so in dev the host is not the gate.
    if (!import.meta.env.DEV && url.host !== window.location.host) return null;
    return /^\/t\/([^/]+)\/?$/.exec(url.pathname)?.[1] ?? null;
  } catch {
    return null;
  }
};

export interface TableScanCardProps {
  readonly body: string;
  readonly onSeated: (table: ResolvedTable) => void;
  /** Opens the camera as soon as the card appears — for the sheet that exists to fix a bad scan. */
  readonly autoStart?: boolean;
}

/**
 * The one place a guest is asked to point their phone at the code. Their cart is untouched
 * throughout: nothing here navigates.
 */
export const TableScanCard = ({ body, onSeated, autoStart = false }: TableScanCardProps) => {
  const [scanning, setScanning] = useState(autoStart && canScanInPage());
  const [failed, setFailed] = useState(false);
  const [seated, setSeated] = useState(false);
  const handoff = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(
    () => () => {
      clearTimeout(handoff.current);
    },
    [],
  );

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
        setSeated(true);
        handoff.current = setTimeout(() => {
          onSeated(resolved);
        }, SEATED_PAUSE_MS);
      })
      .catch(() => {
        setFailed(true);
      });
  };

  if (seated) {
    return (
      <div className="flex flex-col items-center gap-2 py-2 text-center">
        <span aria-hidden className="text-5xl">
          👀
        </span>
        <p className="text-base font-extrabold">{t('table.seatedTitle')}</p>
        <p className="text-muted-foreground text-sm">{t('table.seatedBody')}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <p className="text-muted-foreground text-sm">{body}</p>

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
        <p className="bg-muted w-full rounded-xl px-4 py-3 text-sm">{t('table.scanWithCamera')}</p>
      )}

      {canScanInPage() ? (
        <p className="text-muted-foreground text-xs">{t('table.scanCartKept')}</p>
      ) : null}
      {failed ? <p className="text-destructive text-xs">{t('table.scanFailed')}</p> : null}
    </div>
  );
};
