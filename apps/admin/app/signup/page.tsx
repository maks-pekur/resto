import Link from 'next/link';
import { ThemeToggle } from '@/components/theme-toggle';
import { SignUpForm } from './signup-form-client';

export default function SignUpPage() {
  return (
    <div className="bg-muted/40 flex min-h-screen items-center justify-center p-6">
      <div className="fixed top-4 right-4 z-50">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-md space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Create your Resto account</h1>
          <p className="text-muted-foreground text-sm">Sign up to provision a new tenant.</p>
        </div>
        <SignUpForm />
        <p className="text-muted-foreground text-center text-sm">
          Already have an account?{' '}
          <Link className="underline" href="/login">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
