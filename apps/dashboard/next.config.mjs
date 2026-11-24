/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  { key: "X-DNS-Prefetch-Control", value: "off" },
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  devIndicators: false,
  transpilePackages: ["@forge/shared", "@forge/db", "@forge/auth"],
  experimental: {
    serverActions: {
      bodySizeLimit: "1mb",
    },
  },
  // `next build` reuses its webpack filesystem cache (.next/cache/webpack)
  // between runs. On Next 15.5.29 (bundled webpack 5.98.0), a warm build can
  // give two Next runtime modules each other's ids while keeping cached code
  // in another chunk that still uses the old ids. Prerender then calls
  // `createServerSearchParamsForServerPage` from the wrong module
  // ("T is not a function"). Cold builds always produce consistent output,
  // so production builds skip the persistent cache. Dev keeps its own cache.
  webpack(config, { dev }) {
    if (!dev) config.cache = false;
    return config;
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
