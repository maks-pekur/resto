'use client';

interface ErrorProps {
  readonly reset: () => void;
}

export default function Error({ reset }: ErrorProps) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <h1 className="text-[20px] font-semibold leading-[1.2]">Something went wrong</h1>
      <p className="mt-3 max-w-sm text-[16px] leading-[1.5] text-[oklch(0.45_0_0)]">
        We&apos;re having trouble loading the menu. Try refreshing the page.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 rounded-lg bg-[var(--primary,#16a34a)] px-4 py-2 text-[14px] font-medium text-white transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[--ring]"
      >
        Try again
      </button>
    </main>
  );
}
