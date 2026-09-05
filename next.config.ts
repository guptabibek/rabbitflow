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
        // User-supplied files. Content is validated on upload
        // (src/lib/domain/file-upload.ts); this CSP is the second line of defence
        // so a stored file cannot execute as active content on this origin even
        // if a validation gap is later found.
        //
        // A response CSP applies when the URL is loaded as a *document* — i.e. the
        // stored-XSS case of navigating straight to the file. It does not apply to
        // subresource loads, so `<img src="/uploads/avatars/...">` still renders.
        source: "/uploads/:path*",
        headers: [
          ...securityHeaders,
          {
            key: "Content-Security-Policy",
            value: "default-src 'none'; img-src 'self'; style-src 'none'; sandbox",
          },
        ],
      },
      {
        // Attachments are only ever offered as downloads in the UI, never rendered
        // inline, so they can carry an attachment disposition as well. Avatars are
        // deliberately excluded — they must stay renderable in <img>.
        source: "/uploads/attachments/:path*",
        headers: [{ key: "Content-Disposition", value: "attachment" }],
      },
    ];
  },
};

export default nextConfig;
