import { redirect } from 'next/navigation';

export default function HomePage(): never {
  // Canonical landing — `/dashboard` is the entry point.
  // Auth is enforced by `proxy.ts` (middleware) and the dashboard layout;
  // unauthenticated visitors are bounced to `/login`.
  redirect('/dashboard');
}
