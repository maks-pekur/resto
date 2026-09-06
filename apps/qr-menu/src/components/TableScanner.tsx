import { useEffect, useRef, useState } from 'react';
import { t } from '../i18n';

/**
 * Chromium ships a barcode reader; Safari does not. `mediaDevices` is the second half: it is
 * absent outside a secure context, which is how a plain-http dev host behaves.
 */
export const canScanInPage = (): boolean =>
  typeof window !== 'undefined' && 'BarcodeDetector' in window && mediaDevices() !== undefined;

/** `lib.dom` types `mediaDevices` as always present; outside a secure context it is not. */
const mediaDevices = (): MediaDevices | undefined =>
  typeof navigator === 'undefined'
    ? undefined
    : (navigator as Navigator & { mediaDevices?: MediaDevices }).mediaDevices;

interface DetectedBarcode {
  readonly rawValue: string;
}

interface BarcodeDetectorLike {
  detect: (source: CanvasImageSource) => Promise<readonly DetectedBarcode[]>;
}

type BarcodeDetectorCtor = new (options: { formats: string[] }) => BarcodeDetectorLike;

export interface TableScannerProps {
  /** Called with whatever the code contained; the caller decides whether it is one of ours. */
  readonly onDecoded: (raw: string) => void;
  readonly onUnavailable: () => void;
}

const SCAN_INTERVAL_MS = 400;

export const TableScanner = ({ onDecoded, onUnavailable }: TableScannerProps) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor })
      .BarcodeDetector;
    // Reading through an absent `mediaDevices` throws synchronously rather than rejecting, and
    // would take the sheet down with it.
    const media = mediaDevices();
    if (Detector === undefined || media === undefined) {
      onUnavailable();
      return;
    }

    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    const detector = new Detector({ formats: ['qr_code'] });

    const tick = (): void => {
      const video = videoRef.current;
      if (stopped || video === null || video.readyState < 2) {
        timer = setTimeout(tick, SCAN_INTERVAL_MS);
        return;
      }
      detector
        .detect(video)
        .then((codes) => {
          const [first] = codes;
          if (first !== undefined) {
            onDecoded(first.rawValue);
            return;
          }
          if (!stopped) timer = setTimeout(tick, SCAN_INTERVAL_MS);
        })
        .catch(() => {
          if (!stopped) timer = setTimeout(tick, SCAN_INTERVAL_MS);
        });
    };

    media
      .getUserMedia({ video: { facingMode: 'environment' } })
      .then((granted) => {
        if (stopped) {
          granted.getTracks().forEach((track) => {
            track.stop();
          });
          return;
        }
        stream = granted;
        if (videoRef.current !== null) {
          videoRef.current.srcObject = granted;
          void videoRef.current.play();
        }
        tick();
      })
      .catch(() => {
        setDenied(true);
        onUnavailable();
      });

    return () => {
      stopped = true;
      if (timer !== null) clearTimeout(timer);
      stream?.getTracks().forEach((track) => {
        track.stop();
      });
    };
  }, [onDecoded, onUnavailable]);

  if (denied) return null;

  return (
    <div className="bg-muted relative aspect-square w-full overflow-hidden rounded-2xl">
      <video ref={videoRef} muted playsInline className="size-full object-cover" />
      {/* A frame to aim at — a bare video feed leaves the guest guessing. */}
      <span
        aria-hidden
        className="border-primary pointer-events-none absolute inset-[18%] rounded-2xl border-4"
      />
      <p className="bg-background/80 absolute inset-x-0 bottom-0 px-4 py-2 text-center text-xs backdrop-blur">
        {t('table.scanHint')}
      </p>
    </div>
  );
};
