import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./lib/i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  typedRoutes: true,
  async rewrites() {
    const apiOrigin = process.env.NEXT_PUBLIC_API_ORIGIN ?? 'http://localhost:3000';
    return [
      { source: '/api/:path*', destination: `${apiOrigin}/api/:path*` },
      { source: '/v1/:path*', destination: `${apiOrigin}/v1/:path*` },
    ];
  },
};

export default withNextIntl(nextConfig);
