# RabbitFlow marketing site

An isolated, dependency-free static site. It does not modify Next.js routes, cookies, proxy rules or application authentication. It uses the repository's existing logo/mark and no third-party fonts or tracking.

```bash
node scripts/build-marketing.mjs /tmp/rabbitflow-site
python3 -m http.server 4173 --bind 127.0.0.1 --directory /tmp/rabbitflow-site
```

The default build is noindex and disallows crawling. For an approved real deployment origin, set `SITE_URL=https://your-real-host` when running the builder. It validates an HTTPS origin and generates canonical/Open Graph URLs, sitemap.xml, robots.txt and structured data. Do not use the suggested hostname until DNS, TLS and owner authorization are established. No deployment is performed by the script.

The product-preview panel contains an actual backlog screenshot using synthetic Orbit project data; it is a static preview, not an interactive demo. The decorative workflow diagram is labeled separately; see [visual assets](../docs/launch/VISUAL_ASSETS.md). Product links default to the existing feat/launch-readiness branch so previews work before merge. Build with DOCS_REF=main after merge. Rebuilds require an empty directory or a directory marked by this builder; symlink outputs and source directories are rejected. The MIT license was selected with explicit owner approval.
