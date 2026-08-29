'use client';

interface ErrorProps {
  readonly reset: () => void;
}

export default function Error({ reset }: ErrorProps) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 text-center">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="mt-3 max-w-sm text-base text-muted-foreground">
        We&apos;re having trouble loading the menu. Try refreshing the page.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring"
      >
        Try again
      </button>
    </main>
  );
}
