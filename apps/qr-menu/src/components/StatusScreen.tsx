import { t } from '../i18n';

interface Props {
  readonly title: string;
  readonly body?: string;
  readonly onRetry?: () => void;
  readonly live?: boolean;
}

export const StatusScreen = ({ title, body, onRetry, live = false }: Props) => (
  <main
    className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center"
    aria-live={live ? 'polite' : undefined}
  >
    <h1 className="text-2xl font-extrabold text-balance">{title}</h1>
    {body ? <p className="text-muted-foreground max-w-sm text-sm">{body}</p> : null}
    {onRetry ? (
      <button
        type="button"
        onClick={onRetry}
        className="bg-primary text-primary-foreground focus-visible:ring-ring mt-2 h-12 cursor-pointer rounded-full px-6 text-base font-bold focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        {t('menu.error.retry')}
      </button>
    ) : null}
  </main>
);
