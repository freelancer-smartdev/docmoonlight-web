/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  productionBrowserSourceMaps: true,
  compiler: { removeConsole: false },

  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'storage.googleapis.com',
        pathname: '/uxpilot-auth.appspot.com/**',
      },
    ],
  },

  // Forward client requests /api/* to your public backend host.
  // On Vercel, set BACKEND_BASE_URL in Project → Settings → Environment Variables.
  // Locally, it falls back to http://localhost:4000 so dev keeps working.
  async rewrites() {
    const backend = (process.env.BACKEND_BASE_URL || 'http://localhost:4000').replace(/\/$/, '');
    return [{ source: '/api/:path*', destination: `${backend}/:path*` }];
  },

  poweredByHeader: false,
};

module.exports = nextConfig;
