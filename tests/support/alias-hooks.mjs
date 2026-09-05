import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

/**
 * Resolve the `@/*` path alias for the Node test runner.
 *
 * `tsconfig.json` maps `@/*` to `./src/*`, but Node's ESM resolver does not read
 * tsconfig, so any test whose module graph reaches an `@/`-prefixed import fails
 * with ERR_MODULE_NOT_FOUND. That is why `tests/domain/work-item-schema.test.ts`
 * was previously omitted from the `npm test` file list.
 *
 * Registered via `--import ./tests/support/alias-hooks.mjs`.
 */
register(
  new URL('./alias-resolver.mjs', import.meta.url),
  pathToFileURL('./')
)
