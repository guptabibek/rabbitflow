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

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const resolved = resolveAliasedPath(specifier)
    if (resolved) {
      return { url: resolved, shortCircuit: true }
    }
  }

  return nextResolve(specifier, context)
}
