import type { NextConfig } from "next";

/**
 * Security headers applied to every response.
 *
 * These are defence in depth: nginx sets a subset at the edge, but nginx's
 * `add_header` inheritance means any `location` block that adds a header of its
 * own discards the server-level set. Emitting them from the application
 * guarantees they are present regardless of the proxy in front.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
];

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  /*
    Hosts allowed to load `/_next/*` dev resources.

    Next's dev server serves its client chunks only to its own origin unless a
    host is listed here. The E2E suite drives the app on `127.0.0.1` while the
    dev server's origin is `localhost`, so every chunk was blocked: the page
    rendered from the server and looked correct, React never hydrated, and the
    login form fell back to a native GET submit that produced no API call at
    all. Nothing failed loudly — the only trace was one warning in the dev log.

    Development-only; production builds ignore it.
  */
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // Do not advertise the framework or its version.
  poweredByHeader: false,
  experimental: {
    cpus: 2,
  },
  turbopack: {
    root: process.cwd(),
    resolveExtensions: ['.tsx', '.ts', '.jsx', '.js', '.json'],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        // Uploads now live outside `public/` and are served by authorising route
        // handlers, which set their own CSP and disposition headers per file.
        // This block remains only to neutralise anything left in the old
        // location by a deployment that predates the move.
        source: "/uploads/:path*",
        headers: [
          ...securityHeaders,
          {
            key: "Content-Security-Policy",
            value: "default-src 'none'; img-src 'self'; style-src 'none'; sandbox",
          },
          { key: "Content-Disposition", value: "attachment" },
        ],
      },
    ];
  },
};

export default nextConfig;
