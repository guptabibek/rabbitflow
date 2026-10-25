import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const output = path.resolve(process.argv[2] || path.join(root, 'site/dist'))
// Never allow an output that overwrites source or an existing non-build tree.
if (fs.existsSync(output) && fs.readdirSync(output).some(name => !['index.html', 'styles.css', 'assets', 'robots.txt', 'sitemap.xml'].includes(name))) {
  throw new Error('Output contains unrelated files; select an empty build directory')
}
if (output === root || output === path.join(root, 'site') || root.startsWith(output + path.sep)) {
  throw new Error('Output must not overwrite source')
}
let origin = null
if (process.env.SITE_URL) {
  const parsed = new URL(process.env.SITE_URL)
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash || parsed.port || ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)) {
    throw new Error('SITE_URL must be the approved public HTTPS origin without credentials, port, path, query or fragment')
  }
  origin = parsed.origin
}
fs.mkdirSync(path.join(output, 'assets'), { recursive: true })
for (const name of ['rabbitflow-mark.png', 'rabbitflow-social-card.png', 'rabbitflow-logo.png']) {
  fs.copyFileSync(path.join(root, 'public/brand', name), path.join(output, 'assets', name))
}
// URLs are escaped for their HTML/XML contexts; JSON-LD is protected from closing script tags.
const escape = value => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
let html = fs.readFileSync(path.join(root, 'site/index.html'), 'utf8')
if (origin) {
  const url = escape(origin + '/')
  const structured = JSON.stringify({ '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: 'RabbitFlow', applicationCategory: 'BusinessApplication', operatingSystem: 'Self-hosted server', url: origin + '/', sameAs: 'https://github.com/guptabibek/rabbitflow', description: 'Self-hosted Agile project management for engineering teams.' }).replaceAll('<', '\u003c')
  html = html.replace('noindex,nofollow', 'index,follow').replace('<!-- DEPLOYMENT_METADATA -->', `<link rel="canonical" href="${url}"><meta property="og:url" content="${url}"><meta property="og:image" content="${escape(origin + '/assets/rabbitflow-social-card.png')}"><meta property="og:image:alt" content="RabbitFlow logo"><script type="application/ld+json">${structured}</script>`)
  fs.writeFileSync(path.join(output, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${url}</loc></url></urlset>\n`)
  fs.writeFileSync(path.join(output, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n`)
} else {
  fs.rmSync(path.join(output, 'sitemap.xml'), { force: true })
  fs.writeFileSync(path.join(output, 'robots.txt'), 'User-agent: *\nDisallow: /\n')
}
fs.writeFileSync(path.join(output, 'index.html'), html)
fs.copyFileSync(path.join(root, 'site/styles.css'), path.join(output, 'styles.css'))
console.log(`Built static site in ${output}; indexing ${origin ? 'enabled for configured origin' : 'disabled'}`)
