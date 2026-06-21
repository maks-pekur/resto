import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./lib/i18n/request.ts');

const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  typedRoutes: true,
  transpilePackages: ['@resto/cart'],
};

export default withNextIntl(nextConfig);
