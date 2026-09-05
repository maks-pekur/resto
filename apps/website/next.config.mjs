import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import createNextIntlPlugin from 'next-intl/plugin';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

const withNextIntl = createNextIntlPlugin('./lib/i18n/request.ts');

const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  typedRoutes: true,
  transpilePackages: ['@resto/cart', '@resto/ui'],
  turbopack: {
    root: resolve(__dirname, '../..'),
  },
  async rewrites() {
    // Caddy owns /v1/* in production; a prod rewrite would hairpin instead
    // of surfacing a missing Caddy route as a 404.
    if (process.env.NODE_ENV === 'production') return [];
    return [
      { source: '/v1/:path*', destination: `${process.env.NEXT_PUBLIC_API_ORIGIN}/v1/:path*` },
    ];
  },
};

export default withNextIntl(nextConfig);
