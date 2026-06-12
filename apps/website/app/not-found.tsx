import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <h1 className="text-[20px] font-semibold leading-[1.2]">Restaurant not found</h1>
      <p className="mt-3 max-w-sm text-[16px] leading-[1.5] text-[oklch(0.45_0_0)]">
        This restaurant isn&apos;t on RestOS yet. If you followed a link, it may have changed.
      </p>
      <Link
        href="/"
        className="mt-6 text-[14px] leading-[1.4] text-[var(--primary,#16a34a)] underline-offset-4 hover:underline"
      >
        Go home
      </Link>
    </main>
  );
}
