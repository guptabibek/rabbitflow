import { pathToFileURL } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'

const SRC_ROOT = path.resolve(process.cwd(), 'src')

// Extensions to try when the specifier has none, mirroring the bundler's
// resolution order for this project.
const CANDIDATE_SUFFIXES = ['', '.ts', '.tsx', '.mts', '.js', '.mjs', '/index.ts', '/index.tsx']

function resolveAliasedPath(specifier) {
  const relative = specifier.slice(2) // strip the leading "@/"
  const base = path.join(SRC_ROOT, relative)

  for (const suffix of CANDIDATE_SUFFIXES) {
    const candidate = `${base}${suffix}`
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return pathToFileURL(candidate).href
    }
  }

  return null
}

/**
 * Next's package exports resolve under the bundler, but Node's ESM resolver
 * needs the explicit file. Only the subpaths integration tests actually import
 * are mapped, so an unexpected specifier fails loudly rather than silently
 * resolving somewhere surprising.
 */
const NEXT_SUBPATH_ALIASES = {
  'next/server': 'next/server.js',
  'next/headers': 'next/headers.js',
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const resolved = resolveAliasedPath(specifier)
    if (resolved) {
      return { url: resolved, shortCircuit: true }
    }
  }

  const nextAlias = NEXT_SUBPATH_ALIASES[specifier]
  if (nextAlias) {
    return nextResolve(nextAlias, context)
  }

  return nextResolve(specifier, context)
}
