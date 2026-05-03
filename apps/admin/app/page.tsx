import { redirect } from 'next/navigation';

export default function HomePage(): never {
  // The dashboard route is the canonical landing page. The login flow
  // lands in a follow-up PR; until then `/dashboard` is publicly
  // reachable so we can verify the shadcn shell renders.
  redirect('/dashboard');
}
