/**
 * Next.js boot hook (auto-detected by Next 16). Side-effect imports
 * `./lib/env` so a production deploy with a missing required env var
 * crashes at process start, before any request handler mounts
 * (apps/CLAUDE.md env-var rule; CONTEXT D-05).
 *
 * The `NEXT_RUNTIME === 'nodejs'` guard prevents the Edge runtime from
 * trying to import server-only modules.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./lib/env');
  }
}
