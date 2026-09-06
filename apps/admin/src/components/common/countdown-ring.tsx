import { cn } from '@/lib/utils';

export type CountdownTone = 'idle' | 'calm' | 'warning' | 'late';

export interface CountdownRingProps {
  /** 1 is the whole promise still ahead, 0 is none of it left. */
  readonly progress: number;
  readonly label: string;
  /** Rendered under the label, for spans that need two units to be read. */
  readonly sublabel?: string;
  readonly tone: CountdownTone;
  readonly ariaLabel?: string;
  readonly className?: string;
}

const TONE_CLASS: Record<CountdownTone, string> = {
  idle: 'text-muted-foreground',
  calm: 'text-success',
  warning: 'text-warning',
  late: 'text-destructive',
};

const SIZE = 40;
const STROKE = 3;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * Minutes inside a ring that drains as the promise is spent. Colour is the second signal, never
 * the only one — the number and the minus sign say the same thing without it.
 */
export function CountdownRing({
  progress,
  label,
  sublabel,
  tone,
  ariaLabel,
  className,
}: CountdownRingProps) {
  const clamped = Math.min(Math.max(progress, 0), 1);

  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center',
        TONE_CLASS[tone],
        className,
      )}
      style={{ width: SIZE, height: SIZE }}
      role="img"
      aria-label={ariaLabel ?? label}
    >
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${String(SIZE)} ${String(SIZE)}`} aria-hidden>
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          strokeWidth={STROKE}
          className="stroke-current opacity-25"
        />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          strokeWidth={STROKE}
          // Butt caps, not round: a rounded cap bulges half a stroke past the arc and makes the
          // ring read thicker than the track it sits on.
          className="stroke-current transition-[stroke-dashoffset] duration-500"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - clamped)}
          transform={`rotate(-90 ${String(SIZE / 2)} ${String(SIZE / 2)})`}
        />
      </svg>
      <span aria-hidden className="absolute flex flex-col items-center leading-none">
        <span className="text-xs font-semibold tabular-nums">{label}</span>
        {sublabel === undefined ? null : (
          <span className="text-[10px] tabular-nums opacity-80">{sublabel}</span>
        )}
      </span>
    </span>
  );
}
