import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 text-center">
      <h1 className="text-xl font-semibold">Restaurant not found</h1>
      <p className="mt-3 max-w-sm text-base text-muted-foreground">
        This restaurant isn&apos;t on RestOS yet. If you followed a link, it may have changed.
      </p>
      <Link
        href="/"
        className="mt-6 text-sm text-primary-strong underline-offset-4 hover:underline"
      >
        Go home
      </Link>
    </main>
  );
}
