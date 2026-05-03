/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Hand the api the operator session via cookie when admin runs on the
  // same parent domain. In dev the api lives on :3000; we proxy
  // `/api/*` through Next so the BA cookie flow stays same-origin and
  // the browser sets the cookie on `localhost`.
  async rewrites() {
    const apiOrigin = process.env.NEXT_PUBLIC_API_ORIGIN ?? 'http://localhost:3000';
    return [
      { source: '/api/:path*', destination: `${apiOrigin}/api/:path*` },
      { source: '/v1/:path*', destination: `${apiOrigin}/v1/:path*` },
    ];
  },
};

export default nextConfig;
