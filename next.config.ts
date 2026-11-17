import os from "node:os";
import type { NextConfig } from "next";

/** This machine's LAN IPv4 addresses, so the dev server also works when opened from another device (e.g. http://192.168.x.x:3000). */
const lanHosts = Object.values(os.networkInterfaces())
  .flat()
  .filter((i) => i && i.family === "IPv4" && !i.internal)
  .map((i) => i!.address);

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  // Dev only: lets the browser load page scripts when the app is opened by LAN IP instead of localhost.
  allowedDevOrigins: lanHosts,
  // Keep the uploaded-files folder and local DB data out of file tracing / bundles.
  outputFileTracingExcludes: { "*": ["./storage/**", "./.mongo-data/**"] },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "X-Robots-Tag",
            value: "noindex, nofollow",
          },
        ],
      },
      { source: "/:path*", headers: securityHeaders },
      {
        source: "/admin/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store" },
          { key: "X-Robots-Tag", value: "noindex" },
        ],
      },
    ];
  },
  async redirects() {
    return [
      { source: "/admin", destination: "/admin/dashboard", permanent: false },
      {
        source: "/admin/members",
        destination: "/admin/users",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
